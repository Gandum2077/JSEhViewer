const path = require("path");

module.exports = {
  mode: "production", // 或者 'production' 以优化大小和性能
  entry: "./dist/bootstrap.js", // 最小启动壳可在数据库初始化失败时显示只读恢复页
  output: {
    path: path.resolve(__dirname, "app"),
    filename: "main.js",
  },
  externals: {
    cheerio: "commonjs cheerio", // 排除cheerio
  },
};
