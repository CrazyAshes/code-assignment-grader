const path = require("node:path");
const { contextBridge } = require("electron");

require("dotenv").config({
  path: path.join(__dirname, "../../.env")
});

contextBridge.exposeInMainWorld("electronEnv", {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || ""
});
