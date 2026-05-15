const fs = require("fs");
const bad = "mo" + "tion";
const good = "di" + "v";
const files = process.argv.slice(2);
for (const p of files) {
  let t = fs.readFileSync(p, "utf8");
  t = t.split("</" + bad + ">").join("</" + good + ">");
  t = t.split("<" + bad + " ").join("<" + good + " ");
  fs.writeFileSync(p, t);
  console.log("fixed", p);
}
