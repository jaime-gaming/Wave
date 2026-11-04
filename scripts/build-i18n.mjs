import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, URL } from 'node:url';

/**
 * One dictionary, three platforms.
 *
 * `i18n/es.json` is the single place where Wave's Spanish lives: its keys are
 * the English sentences themselves, so anything not in the table still reads
 * correctly in English instead of showing a key or a blank. The web app reads
 * the JSON directly; Android and Windows cannot, so this script renders the
 * same table into `Loc.kt` and `Localization.cs`. Those two files are generated
 * — edit the JSON and run `npm run build:i18n`, never the other way round, and
 * `npm run release:check` refuses a release whose tables drifted from it.
 */

const KOTLIN_TARGET = 'platforms/android/app/src/main/java/io/github/jaimegaming/wave/ui/Loc.kt';
const CSHARP_TARGET = 'platforms/windows/Wave.Windows/Localization.cs';

const header = (extra) =>
  [
    '// Generated from i18n/es.json by scripts/build-i18n.mjs — do not edit by hand.',
    '//',
    '// The keys are the English sentences themselves, so a screen whose phrase has',
    '// no entry yet still reads correctly in English instead of showing a key.',
    ...(extra ?? []),
  ].join('\n');

/** Escape one string for a Kotlin or C# double-quoted literal; `$` only matters to Kotlin. */
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

/** The Android table: a Compose-observable `Loc` with `t(english)`. */
export function renderLocKt(entries) {
  const rows = [...entries]
    .map(
      ([english, spanish]) =>
        `            ${quote(english, { dollar: true })} to ${quote(spanish, { dollar: true })},`,
    )
    .join('\n');
  return `${header()}
package io.github.jaimegaming.wave.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Locale

/**
 * The language Wave speaks on Android.
 *
 * It follows the device — Spanish when the device asks for Spanish — until the
 * row in Settings → Appearance pins it, and the pin lives in the same
 * SharedPreferences ("wave") as every other preference, under the same
 * "wave-language" key the web app uses in localStorage.
 *
 * [language] is Compose state, so every [t] recomposes the moment the choice
 * changes. Without [init] — a unit test, a screenshot — the device language
 * decides, which in the JVM test locale is English.
 */
object Loc {
    private val spanish: Map<String, String> =
        mapOf(
${rows}
        )

    /** What the person chose: "system", "en" or "es". */
    var choice: String by mutableStateOf("system")
        private set

    /** The language actually spoken: "en" or "es". */
    var language: String by mutableStateOf(deviceLanguage())
        private set

    private val placeholder = Regex("\\\\{(\\\\w+)\\\\}")

    /** Reads the saved choice; call once from the Application before any UI. */
    fun init(context: Context) {
        select(preferences(context).getString("wave-language", null) ?: "system")
    }

    /** Pins the language to "system", "en" or "es" and remembers it. */
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

    /** One English sentence in the chosen language, with {name} placeholders filled. */
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

/** The Windows table: a static `Localization` with `T(english)`. */
export function renderLocalizationCs(entries) {
  const rows = [...entries]
    .map(
      ([english, spanish]) =>
        `            [${quote(english, { dollar: false })}] = ${quote(spanish, { dollar: false })},`,
    )
    .join('\n');
  return `${header()}
using System.Globalization;
using System.Text.RegularExpressions;

namespace Wave.Windows;

/// <summary>
/// The language Wave speaks on Windows.
///
/// It follows <see cref="CultureInfo.CurrentUICulture"/> — Spanish when the
/// system asks for Spanish — until the Idioma row in Appearance pins it, and
/// the pin is saved as the "Language" preference ("system", "en" or "es") in
/// preferences.json, mirroring the "wave-language" key the other clients use.
/// WPF does not re-render by itself, so the window calls <see cref="Init"/>
/// and re-applies its own texts after a change.
/// </summary>
public static partial class Localization {
    private static readonly Dictionary<string, string> Spanish =
        new()
        {
${rows}
        };

    /// <summary>What the person chose: "system", "en" or "es".</summary>
    public static string Choice { get; private set; } = "system";

    /// <summary>The language actually spoken: "en" or "es".</summary>
    public static string Language { get; private set; } = Resolve("system");

    /// <summary>Applies a saved choice; call once before the window renders.</summary>
    public static void Init(string? saved) {
        Choice = saved is "en" or "es" ? saved : "system";
        Language = Resolve(Choice);
    }

    private static string Resolve(string choice) =>
        choice == "system"
            ? CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "es" ? "es" : "en"
            : choice;

    /// <summary>One English sentence in the chosen language, with {name} placeholders filled.</summary>
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

function readEntries(root) {
  const entries = JSON.parse(
    readFileSync(path.join(root, 'i18n', 'es.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  return Object.entries(entries);
}

/** Renders both tables; with `check`, compares instead of writing and lists stale files. */
export function buildI18n(root, { check = false } = {}) {
  const entries = readEntries(root);
  const targets = [
    [KOTLIN_TARGET, renderLocKt(entries)],
    [CSHARP_TARGET, renderLocalizationCs(entries)],
  ];
  const stale = [];
  for (const [target, rendered] of targets) {
    const absolute = path.join(root, target);
    if (check) {
      let current = null;
      try {
        current = readFileSync(absolute, 'utf8');
      } catch {
        /* A missing table is a stale table. */
      }
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
      `Wrote ${KOTLIN_TARGET} and ${CSHARP_TARGET} from i18n/es.json (${result.count} phrases).`,
    );
  }
}
