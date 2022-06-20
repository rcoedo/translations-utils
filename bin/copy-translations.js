#!/usr/bin/env node
const prettier = require("prettier");
const yargs = require("yargs");
const { hideBin } = require("yargs/helpers");
const fsPromises = require('fs').promises;
const path = require("path");
const inquirer = require("inquirer");
const inquirerAcPrompt = require("inquirer-autocomplete-prompt");
const chalk = require("chalk");

inquirer.registerPrompt('autocomplete', inquirerAcPrompt);

const isString = (v) => typeof v === "string" || v instanceof String;
const isObject = (v) => typeof v === "object" && !Array.isArray(v) && v !== null;
const getValue = (object, [key, ...keys]) => {
  if (keys.length === 0) {
    return object[key];
  }

  return getValue(object[key], keys);
};
const setValue = (object, value, [key, ...keys]) => {
  if (keys.length === 0) {
    object[key] = value;
    return;
  }

  setValue(object[key], value, keys);
};

const write = async ({ fromDir, toDir, filenames, fromKeys, toKeys }) => {
  for (const filename of filenames) {
    const fromPath = path.join(process.cwd(), fromDir, filename);
    const toPath = path.join(process.cwd(), toDir, filename);

    const fromJson = require(fromPath);
    const toJson = require(toPath);

    const value = getValue(fromJson, fromKeys);
    setValue(toJson, value, toKeys);

    await fsPromises.writeFile(toPath, prettier.format(JSON.stringify(toJson), { printWidth: 10, parser: "json" }), "utf8");
  }
};

const keysQuestion = async (value, options = { allowNew: false }, result = []) => {
  if (!isObject(value)) {
    return result;
  }

  const keys = Object.keys(value);

  const response = await inquirer.prompt({
    type: "autocomplete",
    name: "key",
    message: `select ${result.length === 0 ? "a" : "another"} key${options.allowNew ? " (or type your own)" : ""}`,
    source: (answerSoFar, input) => {
      const results = keys.filter(key => {
        if (!input) {
            return true;
        }

        return key.startsWith(input);
      });

      return results.length === 0 && options.allowNew ? [input] : results;
    },
  });

  return keysQuestion(value[response.key], options, [...result, response.key]);
};

const confirmQuestion = async (value, toKeys) => {
  msg(chalk.white(`I am going to copy ${chalk.red(value)} into ${chalk.red(toKeys.join("."))}.`));

  const response = await inquirer.prompt({
    type: "confirm",
    name: "confirm",
    message: "is that correct?",
  });

  return response.confirm;
};

const msg = (str) => {
  console.log(chalk.bold.blue("!"), chalk.bold.white(str));
};

const ln = () => console.log();


(async () => {
  const argv = await yargs(hideBin(process.argv))
    .usage("Usage: $0 --from [string] --to [string] --langs [string]")
    .example(
      "$0 --from ./fromDir --to ./toDir --langs en,de,pl",
    )
    .check((args) => isString(args.from) && isString(args.to) && isString(args.langs))
    .parse();

  const filenames = argv.langs.split(",").map(lang => `${lang}.json`);

  const fromPath = path.join(process.cwd(), argv.from, filenames[0]);
  const toPath = path.join(process.cwd(), argv.to, filenames[0]);

  const from = require(fromPath);

  const to = require(toPath);

  msg(chalk.blue("locate your translation:"));
  const fromKeys = await keysQuestion(from);
  const fromValue = getValue(from, fromKeys);

  ln();
  msg(chalk.blue("where do you want me to copy it?"));
  const toKeys = await keysQuestion(to, { allowNew: true });

  ln();
  const confirmation = await confirmQuestion(fromValue, toKeys);

  write({ fromDir: argv.from, toDir: argv.to, filenames, fromKeys, toKeys });
})();
