using System.Buffers.Binary;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Wave.Windows;






public static class WaveBackup
{
    private const int ChunkBytes = 1024 * 1024;
    private const int MaxChunks = 16384;
    private const int MaxHeader = 2 * 1024 * 1024;
    private const int Iterations = 600_000;
    private static readonly byte[] Magic = Encoding.ASCII.GetBytes("WAVEBK2\n");

    public static string Decrypt(Stream source, Stream staging, string password)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(staging);
        ArgumentNullException.ThrowIfNull(password);
        if (!source.CanRead || !staging.CanWrite) throw new InvalidDataException("Invalid stream");
        var passwordBytes = Encoding.UTF8.GetBytes(password);
        if (passwordBytes.Length is 0 or > 1024) throw new InvalidDataException("Invalid password");
        byte[] key = Array.Empty<byte>();
        try
        {
            Span<byte> prefix = stackalloc byte[12];
            source.ReadExactly(prefix);
            if (!prefix[..8].SequenceEqual(Magic)) throw new InvalidDataException("Invalid backup");
            uint headerLength = BinaryPrimitives.ReadUInt32LittleEndian(prefix[8..]);
            if (headerLength == 0 || headerLength > MaxHeader) throw new InvalidDataException("Invalid backup header");
            byte[] headerBytes = new byte[checked((int)headerLength)];
            source.ReadExactly(headerBytes);
            using var json = JsonDocument.Parse(headerBytes, new JsonDocumentOptions { MaxDepth = 8 });
            var root = json.RootElement;
            var signed = root.GetProperty("signed");
            if (signed.GetProperty("version").GetInt32() != 2) throw new InvalidDataException("Unsupported backup");
            string publicHex = signed.GetProperty("publicKey").GetString()!;
            string saltHex = signed.GetProperty("salt").GetString()!;
            string nonceHex = signed.GetProperty("nonce").GetString()!;
            byte[] publicKey = ReadHex(publicHex, 65);
            byte[] salt = ReadHex(saltHex, 16);
            byte[] nonce = ReadHex(nonceHex, 8);
            byte[] signature = ReadHex(root.GetProperty("signature").GetString()!, 64);
            if (publicKey[0] != 4) throw new InvalidDataException("Invalid public key");
            long size = signed.GetProperty("size").GetInt64();
            if (size < 1 || size > (long)ChunkBytes * MaxChunks) throw new InvalidDataException("Invalid size");
            var hashesJson = signed.GetProperty("hashes");
            int chunkCount = checked((int)((size + ChunkBytes - 1) / ChunkBytes));
            if (hashesJson.ValueKind != JsonValueKind.Array || hashesJson.GetArrayLength() != chunkCount)
                throw new InvalidDataException("Invalid chunk list");
            var hashes = new string[chunkCount];
            int hashIndex = 0;
            foreach (var item in hashesJson.EnumerateArray())
            {
                string hash = item.GetString()!;
                _ = ReadHex(hash, 32);
                hashes[hashIndex++] = hash;
            }


            var properties = signed.EnumerateObject().Select(p => p.Name).ToArray();
            if (!properties.SequenceEqual(new[] { "version", "publicKey", "salt", "nonce", "size", "hashes" }))
                throw new InvalidDataException("Unsupported signed header");
            string canonical = "{\"version\":2,\"publicKey\":\"" + publicHex + "\",\"salt\":\"" + saltHex +
                "\",\"nonce\":\"" + nonceHex + "\",\"size\":" + size.ToString(CultureInfo.InvariantCulture) +
                ",\"hashes\":[" + string.Join(",", hashes.Select(h => "\"" + h + "\"")) + "]}";
            using var signer = ECDsa.Create(new ECParameters {
                Curve = ECCurve.NamedCurves.nistP256,
                Q = new ECPoint { X = publicKey[1..33], Y = publicKey[33..65] }
            });
            if (!signer.VerifyData(Encoding.UTF8.GetBytes(canonical), signature, HashAlgorithmName.SHA256, DSASignatureFormat.IeeeP1363FixedFieldConcatenation))
                throw new InvalidDataException("Invalid signature");
            key = Rfc2898DeriveBytes.Pbkdf2(passwordBytes, salt, Iterations, HashAlgorithmName.SHA256, 32);
            using var aes = new AesGcm(key, 16);
            long remaining = size;
            for (int index = 0; index < chunkCount; index++)
            {
                int plainLength = (int)Math.Min(ChunkBytes, remaining);
                byte[] ciphertext = new byte[plainLength + 16];
                source.ReadExactly(ciphertext);
                byte[] expected = ReadHex(hashes[index], 32);
                if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(ciphertext), expected))
                    throw new InvalidDataException("Corrupt backup");
                byte[] iv = new byte[12];
                nonce.CopyTo(iv, 0);
                BinaryPrimitives.WriteUInt32BigEndian(iv.AsSpan(8), (uint)index);
                byte[] plain = new byte[plainLength];
                try { aes.Decrypt(iv, ciphertext.AsSpan(0, plainLength), ciphertext.AsSpan(plainLength, 16), plain); }
                catch (CryptographicException ex) { throw new InvalidDataException("Incorrect password or corrupt backup", ex); }
                staging.Write(plain);
                CryptographicOperations.ZeroMemory(plain);
                remaining -= plainLength;
            }
            if (source.ReadByte() != -1) throw new InvalidDataException("Trailing backup bytes");
            return Convert.ToHexStringLower(SHA256.HashData(publicKey));
        }
        catch (Exception ex) when (ex is EndOfStreamException or JsonException or KeyNotFoundException or FormatException or InvalidOperationException or CryptographicException or OverflowException)
        {
            throw new InvalidDataException("Invalid backup", ex);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passwordBytes);
            CryptographicOperations.ZeroMemory(key);
        }
    }

    private static byte[] ReadHex(string value, int bytes)
    {
        if (value == null || value.Length != bytes * 2 || value.Any(c => !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))))
            throw new InvalidDataException("Invalid hexadecimal field");
        return Convert.FromHexString(value);
    }
}
