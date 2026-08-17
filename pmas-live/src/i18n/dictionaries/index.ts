import type { DictModule } from "../types";
import { componentsDict } from "./components";
import { dashboardDict } from "./dashboard";
import { platformDict } from "./platform";
import { productDetailDict } from "./productDetail";
import { routesDict } from "./routes";
import { sectionsDict } from "./sections";

/** Feature dictionaries merged on top of the base locale objects. */
export const dictModules: DictModule[] = [
  routesDict,
  dashboardDict,
  sectionsDict,
  platformDict,
  productDetailDict,
  componentsDict,
];
