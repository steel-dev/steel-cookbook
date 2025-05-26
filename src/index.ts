import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mri from "mri";
import * as prompts from "@clack/prompts";
import colors from "picocolors";
import { execSync } from "node:child_process";

const {
  red,
  blue,
  blueBright,
  cyan,
  green,
  greenBright,
  yellow,
  magenta,
  cyanBright,
  yellowBright,
  magentaBright,
} = colors;

const argv = mri<{
  template?: string;
  help?: boolean;
  overwrite?: boolean;
}>(process.argv.slice(2), {
  alias: { h: "help", t: "template" },
  boolean: ["help", "overwrite"],
  string: ["template"],
});
const cwd = process.cwd();

// prettier-ignore
const helpMessage = `\
Usage: create-steel-app [OPTION]... [DIRECTORY]

Create a new Steel automation project in JavaScript or TypeScript.
With no arguments, start the CLI in interactive mode.

Options:
  -t, --template NAME        use a specific template

Available templates:
${cyan      ('playwright'     )}  Browser automation with Playwright
${blueBright('puppeteer'      )}  Browser automation with Puppeteer
${green('puppeteer-typescript')}  Browser automation with Puppeteer and TypeScript
${greenBright('playwright-typescript')}  Browser automation with Playwright and TypeScript
`

// prettier-ignore
const steelWelcomeMessage = `

${yellowBright(" @@@@@@@@@@@@@@@@@@@@@@@@@@@@@ ")}
${yellowBright("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@")}
${yellowBright("@@@@@@@@@9999999999999@@@@@@@@@")}      ${cyan("Humans use Chrome, Agents use Steel.")}
${yellowBright("@@@@@[                   ]@@@@@")}      
${yellowBright("@@@@[                      @@@@")}      
${yellowBright("@@@@     @@@@@@@@@@@@@     @@@@")}
${yellowBright("@@@@B              @@@     @@@@")}      Steel is an open-source browser API purpose-built for AI agents.
${yellowBright("@@@@@@               @     @@@@")}      Give one or 1,000 agents the ability to interact with any website.
${yellowBright("@@@@@@@@@@@@@@@@     @     @@@@")}
${yellowBright("@@@@                 @     @@@@")}
${yellowBright("@@@@                @@     @@@@")}
${yellowBright("@@@@@@@@@@@@@@@@g@@@@@@@@@@@@@@")}      ${green("Documentation:")} ${blueBright("https://docs.steel.dev/")}
${yellowBright("@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@")}      ${green("GitHub:")} ${blueBright("https://github.com/steel-dev/steel-browser")}
${yellowBright(" @@@@@@@@@@@@@@@@@@@@@@@@@@@@@ ")}

`;

type ColorFunc = (str: string | number) => string;
type Template = {
  name: string;
  display: string;
  color: ColorFunc;
  customCommands?: string[];
  extraEnvVarsRequired?: { name: string; display: string }[];
};

const TEMPLATES: Template[] = [
  {
    name: "steel-playwright-starter-js",
    display: "Playwright",
    color: magenta,
  },
  {
    name: "steel-playwright-starter",
    display: "Playwright + TypeScript",
    color: cyan,
  },
  {
    name: "steel-puppeteer-starter-js",
    display: "Puppeteer",
    color: yellow,
  },
  {
    name: "steel-puppeteer-starter",
    display: "Puppeteer + TypeScript",
    color: blue,
  },
  {
    name: "steel-files-api-starter",
    display: "Playwright + Files API Starter in TypeScript",
    color: red,
  },
  {
    name: "steel-credentials-starter",
    display: "Playwright + Credentials",
    color: magenta,
  },
  {
    name: "steel-oai-computer-use-node-starter",
    display: "Steel + OpenAI Computer Use + TypeScript",
    color: blueBright,
  },
  {
    name: "steel-browser-use-starter",
    display: "(Python) Steel + Browser Use",
    color: green,
    customCommands: [
      "python -m venv .venv",
      "source .venv/bin/activate",
      "pip install .",
      "python main.py",
    ],
    extraEnvVarsRequired: [
      { name: "OPENAI_API_KEY", display: "OpenAI API key" },
    ],
  },
  {
    name: "steel-oai-computer-use-python-starter",
    display: "(Python) Steel + OpenAI Computer Use",
    color: magentaBright,
    customCommands: [
      "python -m venv .venv",
      "source .venv/bin/activate",
      "pip install .",
      "python main.py",
    ],
    extraEnvVarsRequired: [
      { name: "OPENAI_API_KEY", display: "OpenAI API key" },
    ],
  },
  {
    name: "steel-playwright-python-starter",
    display: "(Python) Steel + Playwright",
    color: greenBright,
    customCommands: [
      "python -m venv .venv",
      "source .venv/bin/activate",
      "pip install -r requirements.txt",
      "python main.py",
    ],
  },
  {
    name: "steel-selenium-starter",
    display: "(Python) Steel + Selenium",
    color: cyanBright,
    customCommands: [
      "python -m venv .venv",
      "source .venv/bin/activate",
      "pip install -r requirements.txt",
      "python main.py",
    ],
  },
];

const TEMPLATE_NAMES = TEMPLATES.map((t) => t.name);

const renameFiles: Record<string, string | undefined> = {
  _gitignore: ".gitignore",
};

const defaultTargetDir = "steel-project";

async function init() {
  const argTargetDir = argv._[0]
    ? formatTargetDir(String(argv._[0]))
    : undefined;
  const argTemplate = argv.template;
  const argOverwrite = argv.overwrite;

  prompts.intro(steelWelcomeMessage);

  const help = argv.help;
  if (help) {
    console.log(helpMessage);
    return;
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const cancel = () => prompts.cancel("Operation cancelled");

  // 1. Get project name and target dir
  let targetDir = argTargetDir;
  if (!targetDir) {
    const projectName = await prompts.text({
      message: "App name:",
      defaultValue: defaultTargetDir,
      placeholder: defaultTargetDir,
    });
    if (prompts.isCancel(projectName)) return cancel();
    targetDir = formatTargetDir(projectName as string);
  }

  // 2. Handle directory if exist and not empty
  if (fs.existsSync(targetDir) && !isEmpty(targetDir)) {
    const overwrite = argOverwrite
      ? "yes"
      : await prompts.select({
          message:
            (targetDir === "."
              ? "Current directory"
              : `Target directory "${targetDir}"`) +
            ` is not empty. Please choose how to proceed:`,
          options: [
            {
              label: "Cancel operation",
              value: "no",
            },
            {
              label: "Remove existing files and continue",
              value: "yes",
            },
            {
              label: "Ignore files and continue",
              value: "ignore",
            },
          ],
        });
    if (prompts.isCancel(overwrite)) return cancel();
    switch (overwrite) {
      case "yes":
        emptyDir(targetDir);
        break;
      case "no":
        cancel();
        return;
    }
  }

  // 3. Get package name
  let packageName = path.basename(path.resolve(targetDir));
  if (!isValidPackageName(packageName)) {
    const packageNameResult = await prompts.text({
      message: "Package name:",
      defaultValue: toValidPackageName(packageName),
      placeholder: toValidPackageName(packageName),
      validate(dir) {
        if (!isValidPackageName(dir)) {
          return "Invalid package.json name";
        }
      },
    });
    if (prompts.isCancel(packageNameResult)) return cancel();
    packageName = packageNameResult;
  }

  // 4. Choose a template
  let templateName = argTemplate;
  let template = TEMPLATES.find((t) => t.name === templateName);
  let hasInvalidArgTemplate = false;
  if (argTemplate && !TEMPLATE_NAMES.includes(argTemplate)) {
    templateName = undefined;
    hasInvalidArgTemplate = true;
  }

  if (!templateName) {
    const selectedTemplate = await prompts.select({
      message: hasInvalidArgTemplate
        ? `"${argTemplate}" isn't a valid template. Please choose from below: `
        : "Select a starting template:",
      options: TEMPLATES.map((template) => {
        const templateColor = template.color;
        return {
          label: templateColor(template.display || template.name),
          value: template,
        };
      }),
    });
    if (prompts.isCancel(selectedTemplate)) return cancel();
    template = selectedTemplate;
    templateName = selectedTemplate.name;
  } else {
    // Find the framework from the template name
    template = TEMPLATES.find((t) => t.name === templateName);
    if (!template) {
      template = TEMPLATES[0];
      templateName = TEMPLATES[0].name;
    }
  }

  const root = path.join(cwd, targetDir);
  fs.mkdirSync(root, { recursive: true });

  const pkgManager = pkgInfo ? pkgInfo.name : "npm";

  prompts.log.step(`Scaffolding project in ${root}...`);

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    "../../examples",
    templateName
  );

  const write = (file: string, content?: string) => {
    const targetPath = path.join(root, renameFiles[file] ?? file);
    if (content) {
      fs.writeFileSync(targetPath, content);
    } else {
      copy(path.join(templateDir, file), targetPath);
    }
  };

  const files = fs.readdirSync(templateDir);
  for (const file of files.filter((f) => f !== "package.json")) {
    write(file);
  }

  // Handle package.json if it exists (for JS/TS projects)
  const packageJsonPath = path.join(templateDir, `package.json`);
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    pkg.name = packageName;
    write("package.json", JSON.stringify(pkg, null, 2) + "\n");
  }

  // Ask for Steel API key
  const steelApiKey = await prompts.text({
    message: `Enter your ${yellow("Steel")} API key (press Enter to skip):`,
    placeholder: "ste-...",
  });

  // Copy .env.example to .env
  if (fs.existsSync(path.join(root, ".env.example"))) {
    fs.copyFileSync(path.join(root, ".env.example"), path.join(root, ".env"));

    if (!prompts.isCancel(steelApiKey) && steelApiKey) {
      // Replace STEEL_API_KEY in the .env file
      const envPath = path.join(root, ".env");
      let envContent = fs.readFileSync(envPath, "utf-8");
      envContent = envContent.replace(
        /STEEL_API_KEY=.*/,
        `STEEL_API_KEY=${steelApiKey}`
      );
      fs.writeFileSync(envPath, envContent);
    }
  }

  // Ask if user wants to install dependencies only for JS/TS projects (not Python)
  let shouldInstall: boolean | symbol = false;
  if (
    !template.customCommands &&
    fs.existsSync(path.join(root, "package.json"))
  ) {
    shouldInstall = await prompts.confirm({
      message: "Do you want to install dependencies now?",
      initialValue: true,
    });

    if (prompts.isCancel(shouldInstall)) {
      return cancel();
    }
  }

  if (shouldInstall) {
    // cd to the project
    process.chdir(root);
    prompts.log.step("Installing dependencies...");
    try {
      // Run npm install or yarn
      execSync(`${pkgManager} install`, { stdio: "inherit" });
      prompts.log.success("Dependencies installed successfully!");
    } catch (error) {
      prompts.log.error("Failed to install dependencies.");
      console.error(error);
    }
  }

  let doneMessage = "";
  const cdProjectName = path.relative(cwd, root);
  doneMessage += `Done. Now run:\n`;
  if (root !== cwd) {
    doneMessage += `\n  cd ${
      cdProjectName.includes(" ") ? `"${cdProjectName}"` : cdProjectName
    }`;
  }
  if (template.customCommands) {
    for (const command of template.customCommands) {
      doneMessage += `\n  ${command}`;
    }
  } else {
    switch (pkgManager) {
      case "yarn":
        doneMessage += "\n  yarn";
        doneMessage += "\n  yarn start";
        break;
      default:
        if (!shouldInstall) {
          doneMessage += `\n  ${pkgManager} install`;
        }
        doneMessage += `\n  ${pkgManager} start`;
        break;
    }
  }

  // Only show API key instructions if they didn't provide one
  const hasProvidedApiKey = !prompts.isCancel(steelApiKey) && !!steelApiKey;
  const envVarsToAdd = hasProvidedApiKey
    ? template.extraEnvVarsRequired || []
    : [
        { name: "STEEL_API_KEY", display: "Steel API key" },
        ...(template.extraEnvVarsRequired || []),
      ];

  // prettier-ignore
  doneMessage +=`
    
  ${envVarsToAdd.length ? `${yellow("Important:")} Add your ${envVarsToAdd.map(e => e.display).join(" + ")} to the .env file
  Get a free API key at: ${blueBright("https://app.steel.dev/settings/api-keys")}
  ` : ''}
  Learn more about Steel at: ${blueBright("https://docs.steel.dev/")}`;

  prompts.outro(doneMessage);
}

function formatTargetDir(targetDir: string) {
  return targetDir.trim().replace(/\/+$/g, "");
}

function copy(src: string, dest: string) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName
  );
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]/, "")
    .replace(/[^a-z\d\-~]+/g, "-");
}

function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

function isEmpty(path: string) {
  const files = fs.readdirSync(path);
  return files.length === 0 || (files.length === 1 && files[0] === ".git");
}

function emptyDir(dir: string) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    if (file === ".git") {
      continue;
    }
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true });
  }
}

interface PkgInfo {
  name: string;
  version: string;
}

function pkgFromUserAgent(userAgent: string | undefined): PkgInfo | undefined {
  if (!userAgent) return undefined;
  const pkgSpec = userAgent.split(" ")[0];
  const pkgSpecArr = pkgSpec.split("/");
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  };
}

init().catch((e) => {
  console.error(e);
});
