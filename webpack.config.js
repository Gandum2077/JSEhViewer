const path = require("path");

module.exports = {
  mode: "production", // 或者 'production' 以优化大小和性能
  entry: "./dist/index.js", // 入口文件
  output: {
    path: path.resolve(__dirname, "app"),
    filename: "main.js",
  },
  externals: {
    cheerio: "commonjs cheerio", // 排除cheerio
  },
};
