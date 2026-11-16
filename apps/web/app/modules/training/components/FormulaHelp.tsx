import { ChevronDown, Info } from "lucide-react";
import { InfoTip } from "@portable-ui/react";
import { useLocale } from "~/shared/i18n/LocaleContext";
import { useT } from "~/shared/i18n/AppLocale";
import { FORMULA_FUNCTIONS } from "./FormulaExpressionInput";
import styles from "./FormulaHelp.module.css";

/** How to write formulas. `compact` shows it as an info icon whose tooltip holds the text (the editor toolbar). */
export function FormulaHelp({ compact = false }: { compact?: boolean }) {
  const locale = useLocale();
  const help = useT().training.formulas.help;
  const title = locale === "pl" ? "Jak pisać formuły" : "Formula help";
  const text =
    locale === "pl"
      ? "Zacznij od =, np. =80 * 0.8 lub =maxBench1r * 80%. Używaj + − * / oraz nawiasów. = podpowiada funkcje i formuły; / podpowiada dane klienta, np. oneRepMax i hrMax. Brakujące parametry trzeba uzupełnić. Wynik oblicza serwer."
      : "Start with =, e.g. =80 * 0.8 or =maxBench1r * 80%. Use + − * / and parentheses. = suggests functions and formulas; / suggests client data such as oneRepMax and hrMax. Complete missing parameters. The server calculates the result.";
  if (compact) return <InfoTip label={title}>{text}</InfoTip>;
  // In the formula dialog: a quiet collapsible card with examples, operators and functions.
  const pl = locale === "pl";
  return (
    <details className={styles.help}>
      <summary>
        <Info aria-hidden="true" />
        <span>{title}</span>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </summary>
      <div className={styles.content}>
        <p>
          {pl
            ? "Wpisz wyrażenie z nazwami wejść, np. base1Rm. Wejścia i ich jednostki ustawiasz poniżej; wynik oblicza serwer. W komórce planu formułę zaczynasz od =."
            : "Write an expression using input names such as base1Rm. Set the inputs and their units below; the server calculates the result. In a plan cell, start a formula with =."}
        </p>
        <dl className={styles.grid}>
          <dt>{pl ? "Przykłady" : "Examples"}</dt>
          <dd>
            <code>base1Rm * 0.8</code>
            <code>base1Rm * 80%</code>
            <code>ROUND_TO_STEP_LOWER(base1Rm * 0.75, 2.5)</code>
          </dd>
          <dt>{pl ? "Działania" : "Operators"}</dt>
          <dd>
            <code>+</code>
            <code>−</code>
            <code>*</code>
            <code>/</code>
            <code>( )</code>
            <code>%</code>
          </dd>
          <dt>{pl ? "Funkcje" : "Functions"}</dt>
          <dd>
            {FORMULA_FUNCTIONS.map((key) => (
              <span key={key} className={styles.fn}>
                <code>{help.signatures[key]}</code>
                {help.functions[key]}
              </span>
            ))}
          </dd>
        </dl>
      </div>
    </details>
  );
}
