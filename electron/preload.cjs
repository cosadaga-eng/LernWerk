const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("lernwerkDesktop", {
  isDesktop: true,
  platform: process.platform,
});
