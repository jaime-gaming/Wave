"""Download only the ten recorded CC0 piano samples needed by score-promo.py.

Uses GitHub CLI authentication already configured by the caller; never reads,
prints, or writes credentials. Downloads are tooling assets, not app dependencies.
"""

import base64
import hashlib
import subprocess
from pathlib import Path

BLOBS = {
    "GrandPno_Main_Sus_A4_v1_rr1.wav": "770dfeb0522be0941baad717c3b50ec76fa56091",
    "GrandPno_Main_Sus_B3_v1_rr1.wav": "9c2402eda0a40156a7945ded8f773bd8d561f137",
    "GrandPno_Main_Sus_C1_v1_rr1.wav": "b5dc2f71cf1eaf3921b05c001c8e4f4b2179c309",
    "GrandPno_Main_Sus_C2_v1_rr1.wav": "d2a4ffe6ebec5fe8db8fc7ce285137dff828b91a",
    "GrandPno_Main_Sus_C3_v1_rr1.wav": "90777bf8f986c0098afb6e53a60ef9685dab49f2",
    "GrandPno_Main_Sus_C5_v1_rr1.wav": "89153faf9b37675dfac3a4953d5a16ca22ba578f",
    "GrandPno_Main_Sus_D4_v1_rr1.wav": "5bc63b8abcac01e9a985ea5fa4ab0498f8ef3653",
    "GrandPno_Main_Sus_E3_v1_rr1.wav": "4166a16d4d65fcc47bd1e38dade007b1b5cb9e2b",
    "GrandPno_Main_Sus_F4_v1_rr1.wav": "b11f7f527a448ee71eda5180f29cd67bdb8074a8",
    "GrandPno_Main_Sus_G3_v1_rr1.wav": "5213d92986fd1099aa25615dcdf2e5fdf919ca18",
    "VCSL-LICENSE.txt": "0e259d42c996742e9e3cba14c677129b2c1b6311",
}
output = Path(".cache/audio")
output.mkdir(parents=True, exist_ok=True)
for name, sha in BLOBS.items():
    target = output / name

    def identity(data):
        return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()

    if target.exists() and identity(target.read_bytes()) == sha:
        print(f"Verified {name}")
        continue
    content = subprocess.check_output(
        ["gh", "api", f"repos/sgossner/VCSL/git/blobs/{sha}", "--jq", ".content"],
        text=True,
    )
    data = base64.b64decode(content)
    if identity(data) != sha:
        raise RuntimeError(f"Git blob verification failed: {name}")
    target.write_bytes(data)
    print(f"Downloaded and verified {name}")
