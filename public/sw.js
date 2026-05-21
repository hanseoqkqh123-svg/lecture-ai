self.addEventListener("install", (event) => {
  console.log("Service Worker installed");
});

self.addEventListener("fetch", (event) => {
  // 기본 fetch 유지
});