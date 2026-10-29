module.exports = {
  ci: {
    collect: {
      url: ["http://127.0.0.1:3000/e/sample-music-night"],
      numberOfRuns: 3,
      startServerCommand: "pnpm start --port 3000",
      startServerReadyPattern: "Ready",
      settings: {
        chromeFlags: "--no-sandbox --disable-dev-shm-usage",
        onlyCategories: ["performance", "accessibility"],
      },
    },
    assert: {
      aggregationMethod: "median",
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
      },
    },
    upload: { target: "filesystem", outputDir: "lighthouse-results" },
  },
};
