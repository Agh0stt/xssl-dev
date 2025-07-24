const fs = require("fs");
const readline = require("readline");
const { execSync } = require("child_process");

let vars = {};
let consts = {};
let funcs = {};

function evalExpr(expr) {
  // Escape characters
  expr = expr
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"');

  // String interpolation: ${...}
  expr = expr.replace(/\${([^}]+)}/g, (_, code) => {
    try {
      return eval(code.replace(/\$([a-zA-Z_]\w*)/g, (_, v) => vars[v] ?? consts[v] ?? ""));
    } catch {
      return "";
    }
  });

  // Replace $var
  expr = expr.replace(/\$([a-zA-Z_]\w*)/g, (_, v) => vars[v] ?? consts[v] ?? "");

  // Math: sqrt, floor division
  expr = expr.replace(/√\s*(\w+)/g, 'Math.sqrt($1)');
  expr = expr.replace(/(\w+)\s*\/\/\s*(\w+)/g, 'Math.floor($1 / $2)');

  try {
    return eval(expr);
  } catch {
    return expr;
  }
}

function parse(lines) {
  let output = [];
  let i = 0;

  function parseBlock() {
    const block = [];
    while (i < lines.length && !/^(end|})$/.test(lines[i].trim())) {
      block.push(lines[i++]);
    }
    i++; // Skip 'end'
    return block;
  }

  while (i < lines.length) {
    let line = lines[i++].trim();
    if (!line || line.startsWith("//")) continue;

    // PRINT
    if (line.startsWith("print ")) {
      let content = line.slice(6).trim();
      const parts = content.split("+").map(s => s.trim());
      const result = parts.map(evalExpr).join("");
      output.push(result);
    }
      // --- SHELL COMMANDS ---
else if (line.startsWith("cd ")) {
  const dir = line.slice(3).trim();
  try {
    process.chdir(dir);
    output.push("Changed directory to " + process.cwd());
  } catch {
    output.push("Failed to change directory.");
  }
}
else if (line.startsWith("get-pkg ")) {
  const args = line.split(" ").slice(1);
  const action = args[0];
  const name = args[1];
  const silent = args.includes("-y");
  const isSearchLocal = args.includes("--local");

  const targetDir = ".pkg";
  const filePath = `${targetDir}/${name}.pkg`;
  const repoURL = `https://xssl-pkg-repo.vercel.app/stable/pkg/release/${name}.pkg`;

  function log(msg) {
    if (!silent) output.push(msg);
  }

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir);

  if (action === "install") {
    log("Reading package lists... Done");
    log(`The following packages will be installed:\n  ${name}`);
    log("Size: 12 MB");
    log(`Get:1 ${repoURL} [51 B]`);

    try {
      execSync(`bash scripts/get.sh ${name}`, { stdio: "inherit" });
      if (fs.existsSync(filePath)) {
        const pkgCode = fs.readFileSync(filePath, "utf-8");
        try {
          eval(pkgCode);
          log(`Package '${name}' loaded and installed successfully.`);
        } catch (err) {
          log(`Package '${name}' downloaded but failed to load: ${err.message}`);
        }
      } else {
        log(`Package '${name}' downloaded but not found.`);
      }
    } catch {
      log(`Failed to install package '${name}'`);
    }

  } else if (action === "uninstall") {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      log(`Package '${name}' uninstalled.`);
    } else {
      log(`Package '${name}' not found.`);
    }

  } else if (action === "reinstall") {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    try {
      execSync(`bash scripts/get.sh ${name}`, { stdio: "inherit" });
      if (fs.existsSync(filePath)) {
        const pkgCode = fs.readFileSync(filePath, "utf-8");
        eval(pkgCode);
        log(`Package '${name}' reinstalled and loaded.`);
      }
    } catch {
      log(`Failed to reinstall package '${name}'`);
    }

  } else if (action === "list" && name === "pkg") {
    const files = fs.readdirSync(targetDir).filter(f => f.endsWith(".pkg"));
    if (files.length > 0) {
      log("Installed packages:");
      files.forEach(f => log(" - " + f.replace(".pkg", "")));
    } else {
      log("No packages installed.");
    }

  } else if (action === "search") {
    if (isSearchLocal) {
      const files = fs.readdirSync(targetDir).filter(f => f.includes(name));
      if (files.length) {
        log("Found locally:");
        files.forEach(f => log(" - " + f));
      } else {
        log(`No local results for '${name}'`);
      }
    } else {
      log(`Searching remote repository for '${name}'...`);
      log(`Found in remote: ${name}.pkg`);
      // Optional: You can use fetch to load metadata.json from the repo
    }

  } else {
    log(`Unknown action: ${action}`);
  }
  }


  
else if (line.startsWith("rf ")) {
  const target = line.split(" ")[1];
  if (fs.existsSync(target)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      output.push(`Deleted '${target}'`);
    } catch (err) {
      output.push(`Error deleting '${target}': ${err.message}`);
    }
  } else {
    output.push(`No such file or directory: '${target}'`);
  }
}
else if (line.endsWith(".xssl") && fs.existsSync(line.trim())) {
  const code = fs.readFileSync(line.trim(), "utf-8").split("\n");
  const result = parse(code);
  if (result.length > 0) console.log(result.join("\n"));
}
else if (line === "ls") {
  const files = fs.readdirSync(process.cwd());
  output.push(files.join("\n"));
}

else if (line.startsWith("mkdir ")) {
  const dir = line.slice(6).trim();
  try {
    fs.mkdirSync(dir);
    output.push(`Created directory ${dir}`);
  } catch {
    output.push(" Directory already exists or error.");
  }
}

else if (line.startsWith("rmdir ")) {
  const dir = line.slice(6).trim();
  try {
    fs.rmdirSync(dir);
    output.push(`Removed directory ${dir}`);
  } catch {
    output.push(" Failed to remove directory.");
  }
}

else if (line.startsWith("rm ")) {
  const file = line.slice(3).trim();
  try {
    fs.unlinkSync(file);
    output.push(`Removed file ${file}`);
  } catch {
    output.push(" Failed to remove file.");
  }
}

else if (line.startsWith("touch ")) {
  const file = line.slice(6).trim();
  try {
    fs.writeFileSync(file, "");
    output.push(`Created file ${file}`);
  } catch {
    output.push(" Failed to create file.");
  }
}

else if (line === "pwd") {
  output.push(process.cwd());
}

else if (line === "clear") {
  console.clear();
}
else if (line.startsWith("rmf ")) {
  const target = line.split(" ")[1];
  if (fs.existsSync(target)) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      output.push(`Deleted '${target}'`);
    } catch (err) {
      output.push(`Error deleting '${target}': ${err.message}`);
    }
  } else {
    output.push(`No such file or directory: '${target}'`);
  }
}
else if (line.startsWith("echo ")) {
  const text = line.slice(5).trim();
  output.push(evalExpr(text));
}

else if (line.startsWith("dump ")) {
  const file = line.slice(5).trim();
  try {
    const content = fs.readFileSync(file, "utf-8");
    output.push(content);
  } catch {
    output.push(" Failed to read file.");
  }
}

else if (line === "uname") {
  output.push(require("os").platform());
}
    // DECLARE
    else if (/^(let|const)\s+/.test(line)) {
      const [type, name, ...rest] = line.split(/\s+/);
      const val = evalExpr(rest.join(" "));
      if (type === "let") vars[name] = val;
      else consts[name] = val;
    }

    // DEC x
    else if (line.startsWith("dec ")) {
      vars[line.split(" ")[1]] = null;
    }

    // ASSIGN
    else if (/^\w+\s*=/.test(line)) {
      const [name, ...rest] = line.split("=");
      const val = evalExpr(rest.join("="));
      if (consts.hasOwnProperty(name.trim())) {
        output.push(` Cannot reassign const ${name}`);
      } else {
        vars[name.trim()] = val;
      }
    }

    // INPUT
    else if (line.startsWith("input ")) {
      const [_, __, name, ...promptParts] = line.split(" ");
      const promptText = promptParts.join(" ").replace(/"/g, "");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(promptText + "", (answer) => {
        vars[name] = answer;
        rl.close();
      });
    }

    // FUNCTION DEF
    else if (line.startsWith("func ")) {
      const match = line.match(/func\s+(\w+)\(([^)]*)\)/);
      if (match) {
        const [, name, params] = match;
        const paramList = params.trim().split(/\s+/).filter(Boolean);
        funcs[name] = { params: paramList, body: parseBlock() };
      }
    }

    // FUNCTION CALL
    else if (/\w+\(.*\)/.test(line)) {
      const match = line.match(/(\w+)\(([^)]*)\)/);
      if (match) {
        const [, name, argStr] = match;
        const args = argStr.split(/\s+/).map(evalExpr);
        const fn = funcs[name];
        if (!fn) {
          output.push(` Function not found: ${name}`);
        } else {
          const oldVars = { ...vars };
          fn.params.forEach((p, idx) => vars[p] = args[idx]);
          output.push(...parse(fn.body));
          vars = oldVars;
        }
      }
    }
else if (line.startsWith("clone ")) {
  const args = line.split(" ");
  const repoUrl = args[1];
  let branch = null;
  let destDir = null;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === "-b" && args[i + 1]) branch = args[i + 1];
    if (args[i] === "-d" && args[i + 1]) destDir = args[i + 1];
  }

  let cmd = `git clone ${repoUrl}`;
  if (branch) cmd += ` -b ${branch}`;
  if (destDir) cmd += ` ${destDir}`;

  try {
    console.log(`Cloning from ${repoUrl}...`);
    require("child_process").execSync(cmd, { stdio: "inherit" });
    console.log(" Cloned successfully.");
  } catch {
    console.log(" Clone failed. Check URL or flags.");
  }
}

else if (line.trim() === "pull") {
  try {
    require("child_process").execSync("git pull", { stdio: "inherit" });
    console.log(" Pull completed.");
  } catch {
    console.log(" Pull failed. Are you inside a git repo?");
  }
}

else if (line.trim() === "fetch") {
  try {
    require("child_process").execSync("git fetch", { stdio: "inherit" });
    console.log(" Fetch completed.");
  } catch {
    console.log(" Fetch failed. Are you inside a git repo?");
  }
}
    // GET
    else if (line.startsWith("get ")) {
  const name = line.split(" ")[2];
  try {
    execSync(`bash scripts/getpkg.sh ${name}`, { stdio: "inherit" });
  } catch {
    console.log(" Failed to run get. Please check your internet connection.");
  }
}
    // RUN .pkg commands
   else if (fs.existsSync(`.pkg/${line.split(" ")[0]}.xssl`)) {
      const cmdName = line.split(" ")[0];
      const args = line.split(" ").slice(1);
      const content = fs.readFileSync(`.pkg/${cmdName}.xssl`, "utf-8").split("\n");
      const local = {};
      args.forEach((val, i) => local[`$${i+1}`] = evalExpr(val));
      const replaced = content.map(l => l.replace(/\$(\d+)/g, (_, i) => local[`$${i}`] ?? ""));
      output.push(...parse(replaced));
    }
     // --- IF / ELIF / ELSE ---
else if (line.startsWith("if ")) {
  const condition = evalExpr(line.slice(3).trim());
  if (condition) {
    parse(parseBlock());
  } else {
    while (i < lines.length && lines[i].trim().startsWith("elif ")) {
      const elifCond = evalExpr(lines[i].slice(5).trim());
      i++;
      if (elifCond) {
        parse(parseBlock());
        return;
      } else {
        parseBlock(); // skip
      }
    }
    if (i < lines.length && lines[i].trim() === "else") {
      i++;
      parse(parseBlock());
    }
  }
}
else if (line.startsWith("down ")) {
  const parts = line.split(" ");
  let quiet = false;
  let outputFile = null;
  let url = null;

  for (let i = 1; i < parts.length; i++) {
    if (parts[i] === "-q") {
      quiet = true;
    } else if (parts[i] === "-o") {
      outputFile = parts[++i];
    } else {
      url = parts[i];
    }
  }

  if (!url) {
    output.push("Missing URL for download");
    return;
  }

  const filename = outputFile || url.split("/").pop();
  const cmd = `wget ${quiet ? "-q" : ""} -O "${filename}" "${url}"`;

  try {
    output.push(`Connecting to ${url}`);
    output.push(`Downloading ${filename}...`);
    execSync(cmd, { stdio: "ignore" }); // suppress output
    output.push("Download complete.");
  } catch {
    output.push("Download failed.");
  }
}
// --- SWITCH / CASE / DEFAULT ---
else if (line.startsWith("switch ")) {
  const switchVal = evalExpr(line.split(" ")[1]);
  let matched = false;
  while (i < lines.length && lines[i].trim().startsWith("case ")) {
    const caseVal = evalExpr(lines[i].split(" ")[1]);
    i++;
    if (!matched && caseVal == switchVal) {
      matched = true;
      parse(parseBlock());
    } else {
      parseBlock(); // skip
    }
  }
  if (!matched && lines[i]?.trim() === "default") {
    i++;
    parse(parseBlock());
  }
}

// --- FOR LOOP ---
else if (line.startsWith("for ")) {
  const match = line.match(/for (\w+) (\d+) (\d+)/);
  if (match) {
    const [_, varname, start, end] = match;
    const body = parseBlock();
    for (let j = Number(start); j <= Number(end); j++) {
      vars[varname] = j;
      parse(body);
    }
  }
}

// --- WHILE LOOP ---
else if (line.startsWith("while ")) {
  const cond = line.slice(6).trim();
  const body = parseBlock();
  while (evalExpr(cond)) {
    parse(body);
  }
}

// --- REPEAT LOOP ---
else if (line.startsWith("repeat ")) {
  const count = Number(evalExpr(line.slice(7).trim()));
  const body = parseBlock();
  for (let j = 0; j < count; j++) {
    parse(body);
  }
}
    else {
      // Ignore unknowns silently
    }
  }

  return output;
}

// ENTRY
if (process.argv.length < 3) {
  console.error("Usage: node index.js <file.xssl> OR --repl");
  process.exit(1);
}

if (process.argv[2] === "--repl") {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("Welcome to XSSL!. Type `exit` to quit.");
  function loop() {
    rl.question("xssl> ", (line) => {
      if (line === "exit") return rl.close();
      const out = parse([line]);
      if (out.length) console.log(out.join("\n"));
      loop();
    });
  }
  loop();
} else {
  const file = process.argv[2];
  const code = fs.readFileSync(file, "utf-8").split("\n");
  const out = parse(code);
  if (out.length) console.log(out.join("\n"));
}
