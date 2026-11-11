import path from "node:path";

/** Everything Town Hall writes lives under TOWNHALL_HOME (default ./data). */
export const homeDir = () => process.env.TOWNHALL_HOME ?? path.join(process.cwd(), "data");
/** The mock company data the tools read. Only tools read it; agents do not. */
export const dataDir = () => process.env.TOWNHALL_DATA_DIR ?? path.join(homeDir(), "company");
export const toolsDir = () => path.join(homeDir(), "tools");
export const repoToolsDir = () => path.join(process.cwd(), "tools");
export const pythonBin = () => process.env.TOWNHALL_PYTHON ?? "python3";
