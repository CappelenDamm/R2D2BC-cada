const express = require("express");
const path = require("path");

const app = express();
const PORT = 3001;

// Serve the built library
app.use("/dist", express.static(path.join(__dirname, "../../dist")));

// Serve the PDF example
app.use("/", express.static(__dirname));

app.listen(PORT, () => {
  console.log(`\n📄 PDF example: http://localhost:${PORT}/\n`);
});
