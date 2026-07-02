import { Command } from 'commander';
import { configureProxyFromEnv } from './utils/proxy.js';
import { registerLoginCommand } from './commands/login.js';
import { registerEmployeesCommands } from './commands/employees.js';
import { registerTimeOffCommands } from './commands/time-off.js';
import { registerTimeTrackingCommands } from './commands/time-tracking.js';
import { registerMetaCommands } from './commands/meta.js';
import { registerFilesCommands } from './commands/files.js';
import { registerReportsCommands } from './commands/reports.js';
import { registerGoalsCommands } from './commands/goals.js';
import { registerTrainingCommands } from './commands/training.js';
import { registerBenefitsCommands } from './commands/benefits.js';
import { registerRecruitingCommands } from './commands/recruiting.js';
import { registerWebhooksCommands } from './commands/webhooks.js';
import { registerDatasetsCommands } from './commands/datasets.js';
import { registerHoursCommands } from './commands/hours.js';
import { registerPhotosCommands } from './commands/photos.js';
import { registerTablesCommands } from './commands/tables.js';

configureProxyFromEnv();

const program = new Command();

program
  .name('bamboohr')
  .description('BambooHR CLI — interact with BambooHR API from the command line')
  .version('1.0.0');

// Register all command groups
registerLoginCommand(program);
registerEmployeesCommands(program);
registerTimeOffCommands(program);
registerTimeTrackingCommands(program);
registerMetaCommands(program);
registerFilesCommands(program);
registerReportsCommands(program);
registerGoalsCommands(program);
registerTrainingCommands(program);
registerBenefitsCommands(program);
registerRecruitingCommands(program);
registerWebhooksCommands(program);
registerDatasetsCommands(program);
registerHoursCommands(program);
registerPhotosCommands(program);
registerTablesCommands(program);

program.parse();
