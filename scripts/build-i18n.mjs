import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, URL } from 'node:url';

const KOTLIN_TARGET = 'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui/Loc.kt';
const CSHARP_TARGET = 'platforms/windows/Wave.Windows/Localization.cs';
const STRINGS_TARGET = 'platforms/ios/Wave/es.lproj/Localizable.strings';

function escape(value, { dollar }) {
  let out = '';
  for (const character of value) {
    if (character === '\\' || character === '"') out += `\\${character}`;
    else if (character === '$' && dollar) out += '\\$';
    else if (character === '\n') out += '\\n';
    else if (character === '\r') out += '\\r';
    else if (character === '\t') out += '\\t';
    else if (character.codePointAt(0) < 0x20)
      out += `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`;
    else out += character;
  }
  return out;
}

const quote = (value, options) => `"${escape(value, options)}"`;

export function renderLocKt(entries) {
  const rows = [...entries]
    .map(
      ([english, spanish]) =>
        `            ${quote(english, { dollar: true })} to ${quote(spanish, { dollar: true })},`,
    )
    .join('\n');
  return `package io.github.jaimegaming.wave.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Locale

object Loc {
    private val spanish: Map<String, String> =
        mapOf(
${rows}
        )

        var choice: String by mutableStateOf("system")
        private set

        var language: String by mutableStateOf(deviceLanguage())
        private set

    private val placeholder = Regex("\\\\{(\\\\w+)\\\\}")

        fun init(context: Context) {
        select(preferences(context).getString("wave-language", null) ?: "system")
    }

        fun setChoice(context: Context, next: String) {
        val value = if (next == "en" || next == "es") next else "system"
        preferences(context).edit().putString("wave-language", value).apply()
        select(value)
    }

    private fun select(next: String) {
        choice = if (next == "en" || next == "es") next else "system"
        language = if (choice == "system") deviceLanguage() else choice
    }

    private fun preferences(context: Context) =
        context.getSharedPreferences("wave", Context.MODE_PRIVATE)

    private fun deviceLanguage(): String =
        if (Locale.getDefault().language.startsWith("es")) "es" else "en"

        fun t(english: String, values: Map<String, String> = emptyMap()): String {
        val text = if (language == "es") spanish[english] ?: english else english
        if (values.isEmpty()) return text
        return text.replace(placeholder) { match ->
            values[match.groupValues[1]] ?: match.value
        }
    }
}
`;
}

export function renderLocalizationCs(entries) {
  const rows = [...entries]
    .map(
      ([english, spanish]) =>
        `            [${quote(english, { dollar: false })}] = ${quote(spanish, { dollar: false })},`,
    )
    .join('\n');
  return `using System.Globalization;
using System.Text.RegularExpressions;

namespace Wave.Windows;

public static partial class Localization {
    private static readonly Dictionary<string, string> Spanish =
        new()
        {
${rows}
        };

    public static string Choice { get; private set; } = "system";

    public static string Language { get; private set; } = Resolve("system");

    public static void Init(string? saved) {
        Choice = saved is "en" or "es" ? saved : "system";
        Language = Resolve(Choice);
    }

    private static string Resolve(string choice) =>
        choice == "system"
            ? CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "es" ? "es" : "en"
            : choice;

    public static string T(string english, IReadOnlyDictionary<string, string>? values = null) {
        var text = Language == "es" && Spanish.TryGetValue(english, out var spanish) ? spanish : english;
        return values is null || values.Count == 0 ? text : Fill(text, values);
    }

    private static string Fill(string text, IReadOnlyDictionary<string, string> values) =>
        Placeholder().Replace(text, match =>
            values.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value);

    [GeneratedRegex(@"\\{(\\w+)\\}")]
    private static partial Regex Placeholder();
}
`;
}

export function renderLocalizableStrings(entries) {
  const rows = [...entries]
    .map(
      ([english, spanish]) =>
        `${quote(english, { dollar: false })} = ${quote(spanish, { dollar: false })};`,
    )
    .join('\n');
  return `${rows}\n`;
}

function readEntries(root) {
  const entries = JSON.parse(
    readFileSync(path.join(root, 'i18n', 'es.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  return Object.entries(entries);
}

export function buildI18n(root, { check = false } = {}) {
  const entries = readEntries(root);
  const targets = [
    [KOTLIN_TARGET, renderLocKt(entries)],
    [CSHARP_TARGET, renderLocalizationCs(entries)],
    [STRINGS_TARGET, renderLocalizableStrings(entries)],
  ];
  const stale = [];
  for (const [target, rendered] of targets) {
    const absolute = path.join(root, target);
    if (check) {
      let current = null;
      try {
        current = readFileSync(absolute, 'utf8');
      } catch {}
      if (current !== rendered) stale.push(target);
      continue;
    }
    writeFileSync(absolute, rendered, 'utf8');
  }
  return { count: entries.length, stale };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const checking = process.argv.includes('--check');
  const result = buildI18n(root, { check: checking });
  if (checking) {
    if (result.stale.length) {
      console.error(
        `Generated language tables differ from i18n/es.json:\n  ${result.stale.join(
          '\n  ',
        )}\nRun \`npm run build:i18n\` and commit the result.`,
      );
      process.exitCode = 1;
    } else console.log(`Language tables match i18n/es.json (${result.count} phrases).`);
  } else {
    console.log(
      `Wrote ${KOTLIN_TARGET}, ${CSHARP_TARGET} and ${STRINGS_TARGET} from i18n/es.json (${result.count} phrases).`,
    );
  }
}
