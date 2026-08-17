export type Lang = "en" | "fa";

/** Nested string dictionary. */
export type Dict = { [key: string]: string | Dict };

/** One feature-scoped dictionary module, kept in its own file to avoid merge churn. */
export interface DictModule {
  en: Dict;
  fa: Dict;
}
