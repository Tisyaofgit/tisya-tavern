// Model surface selection belongs to the host, never to a model answer.
export const FORM_TASK_KINDS=Object.freeze({templateInit:'archive',objectArchive:'archive',historyImport:'archive',tableArchive:'archive',tableGenesis:'genesis',assetAdapt:'core'});
export const SIMPLE_TABLE_TASKS=Object.freeze(Object.keys(FORM_TASK_KINDS));
export const ARCHIVE_TABLE_TASKS=Object.freeze(SIMPLE_TABLE_TASKS.filter(task=>FORM_TASK_KINDS[task]==='archive'));
