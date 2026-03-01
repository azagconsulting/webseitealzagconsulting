import fs from "node:fs";
import path from "node:path";

import { StaticAlzagIndexPage } from "@/components/alzag/static-index-page";

export default function HomePage() {
  const alzagStaticEntry = path.join(
    process.cwd(),
    "public",
    "alzag-consulting",
    "index.html",
  );
  if (!fs.existsSync(alzagStaticEntry)) {
    return null;
  }
  return <StaticAlzagIndexPage />;
}
