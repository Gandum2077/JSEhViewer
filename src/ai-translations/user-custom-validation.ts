import type { AITranslationConfigFormItem } from "../types";

type ValidationSeverity = "error" | "warning";

type ValidationIssue = {
  severity: ValidationSeverity;
  field: "scriptText" | "configForm";
  message: string;
  rowIndex?: number;
  key?: string;
};

type UserCustomFormItemType = AITranslationConfigFormItem["type"];

type UserCustomValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  normalizedScriptText?: string;
  configForm?: AITranslationConfigFormItem[];
  defaultConfig?: Record<string, any>;
};

const allowedFormItemTypes: UserCustomFormItemType[] = ["string", "integer", "boolean", "list"];

const reversedKeyNames = new Set(["__service_name__"]);

function createIssue(
  field: ValidationIssue["field"],
  message: string,
  options?: {
    severity?: ValidationSeverity;
    rowIndex?: number;
    key?: string;
  },
): ValidationIssue {
  return {
    severity: options?.severity ?? "error",
    field,
    message,
    rowIndex: options?.rowIndex,
    key: options?.key,
  };
}

function isPlainObject(value: any): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: any): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function buildDefaultConfig(configForm: AITranslationConfigFormItem[]) {
  return Object.fromEntries(configForm.map((item) => [item.key, item.default]));
}

function normalizeScriptText(scriptText: string) {
  return scriptText.trim().replace(/;$/, "");
}

function validateScriptSyntax(scriptText: string, issues: ValidationIssue[]) {
  try {
    new Function(`return (${scriptText});`);
  } catch (error: any) {
    issues.push(createIssue("scriptText", `脚本存在语法错误：${error.message}`));
    return;
  }

  const source = scriptText.trim();
  if (!/^async\s*\([^)]*\)\s*=>\s*\{[\s\S]*\}$/.test(source)) {
    issues.push(createIssue("scriptText", "脚本必须以 `async (imageData, config) => { ... }` 的形式定义。"));
  }

  if (!/^async\b/.test(source)) {
    issues.push(createIssue("scriptText", "脚本必须是异步函数。"));
  }

  const parameterMatch = source.match(/^async\s*\(([^)]*)\)\s*=>/);
  const parameterText = parameterMatch?.[1]?.trim() ?? "";
  const parameterCount = parameterText
    ? parameterText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean).length
    : 0;

  if (parameterCount > 2) {
    issues.push(createIssue("scriptText", "脚本最多只能声明两个参数：`imageData` 和 `config`。"));
  }

  if (parameterCount === 0) {
    issues.push(createIssue("scriptText", "脚本至少需要声明 `imageData` 参数。"));
  }
}

export function validateUserCustomScriptText(scriptText: string): UserCustomValidationResult {
  const issues: ValidationIssue[] = [];
  const normalizedScriptText = normalizeScriptText(scriptText);

  if (!normalizedScriptText) {
    issues.push(createIssue("scriptText", "脚本不能为空。"));
    return {
      ok: false,
      issues,
    };
  }

  validateScriptSyntax(normalizedScriptText, issues);

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
    normalizedScriptText,
  };
}

export function validateUserCustomConfigFormText(configFormText: string): UserCustomValidationResult {
  const issues: ValidationIssue[] = [];
  const normalizedText = configFormText.trim();

  if (!normalizedText) {
    return {
      ok: true,
      issues,
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(normalizedText);
  } catch (error: any) {
    issues.push(createIssue("configForm", `配置表单不是合法的 JSON：${error.message}`));
    return {
      ok: false,
      issues,
    };
  }

  if (!Array.isArray(parsed)) {
    issues.push(createIssue("configForm", "配置表单必须是一个 JSON 数组。"));
    return {
      ok: false,
      issues,
    };
  }

  if (parsed.length === 0) {
    issues.push(createIssue("configForm", "配置表单不能为空。"));
    return {
      ok: false,
      issues,
    };
  }

  const rows: AITranslationConfigFormItem[] = [];
  const keys = new Set<string>();

  parsed.forEach((row, index) => {
    let rowHasError = false;

    if (!isPlainObject(row)) {
      issues.push(createIssue("configForm", "每个表单项都必须是对象。", { rowIndex: index }));
      return;
    }

    const rawType = row.type;
    const rawTitle = row.title;
    const rawKey = row.key;
    if (!rawType) {
      issues.push(
        createIssue("configForm", "每个表单项都必须包含 `type` 类型。", {
          rowIndex: index,
        }),
      );
      return;
    }
    if (typeof rawType !== "string") {
      issues.push(
        createIssue("configForm", "`type`必须是字符串。", {
          rowIndex: index,
        }),
      );
      return;
    }

    if (!rawTitle) {
      issues.push(
        createIssue("configForm", "每个表单项都必须包含 `title` 标题。", {
          rowIndex: index,
        }),
      );
      return;
    }
    if (typeof rawTitle !== "string") {
      issues.push(
        createIssue("configForm", "`title`必须是字符串。", {
          rowIndex: index,
        }),
      );
      return;
    }

    if (!rawKey) {
      issues.push(
        createIssue("configForm", "每个表单项都必须包含 `key` 键名。", {
          rowIndex: index,
        }),
      );
      return;
    }
    if (typeof rawKey !== "string") {
      issues.push(
        createIssue("configForm", "`key`必须是字符串。", {
          rowIndex: index,
        }),
      );
      return;
    }

    const rowType = rawType as UserCustomFormItemType;
    const title = rawTitle.trim();
    const key = rawKey.trim();

    if (!allowedFormItemTypes.includes(rowType)) {
      issues.push(
        createIssue("configForm", `不支持的表单项类型：${String(rowType)}。`, {
          rowIndex: index,
          key,
        }),
      );
      return;
    }

    if (!title) {
      issues.push(createIssue("configForm", "`title` 必须是非空字符串。", { rowIndex: index }));
      rowHasError = true;
    }

    if (!key) {
      issues.push(createIssue("configForm", "`key` 必须是非空字符串。", { rowIndex: index }));
      rowHasError = true;
    } else if (reversedKeyNames.has(key)) {
      issues.push(createIssue("configForm", `${key}为保留名称，不能使用。`, { rowIndex: index, key }));
      rowHasError = true;
    } else if (keys.has(key)) {
      issues.push(createIssue("configForm", `检测到重复的 key：${key}。`, { rowIndex: index, key }));
      rowHasError = true;
    } else {
      keys.add(key);
    }

    if (!("default" in row)) {
      issues.push(
        createIssue("configForm", "每个表单项都必须包含 `default` 默认值。", {
          rowIndex: index,
          key,
        }),
      );
      return;
    }

    switch (rowType) {
      case "string":
        if (typeof row.default !== "string") {
          issues.push(
            createIssue("configForm", "`string` 类型的 `default` 必须是字符串。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        }
        break;
      case "integer":
        if ("min" in row && !isInteger(row.min)) {
          issues.push(
            createIssue("configForm", "`integer` 类型的 `min` 必须是整数。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        }
        if ("max" in row && !isInteger(row.max)) {
          issues.push(
            createIssue("configForm", "`integer` 类型的 `max` 必须是整数。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        }
        if (isInteger(row.min) && isInteger(row.max) && row.min > row.max) {
          issues.push(
            createIssue("configForm", "`min` 不能大于 `max`。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        }
        if (!isInteger(row.default)) {
          issues.push(
            createIssue("configForm", "`integer` 类型的 `default` 必须是整数。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        } else {
          if (isInteger(row.min) && row.default < row.min) {
            issues.push(
              createIssue("configForm", "`default` 不能小于 `min`。", {
                rowIndex: index,
                key,
              }),
            );
            rowHasError = true;
          }
          if (isInteger(row.max) && row.default > row.max) {
            issues.push(
              createIssue("configForm", "`default` 不能大于 `max`。", {
                rowIndex: index,
                key,
              }),
            );
            rowHasError = true;
          }
        }
        break;
      case "boolean":
        if (typeof row.default !== "boolean") {
          issues.push(
            createIssue("configForm", "`boolean` 类型的 `default` 只能是 `true` 或 `false`。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        }
        break;
      case "list":
        if (!Array.isArray(row.items)) {
          issues.push(
            createIssue("configForm", "`list` 类型必须包含 `items` 数组。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
          break;
        }
        if (row.items.length === 0) {
          issues.push(
            createIssue("configForm", "`list` 类型的 `items` 不能为空。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        }
        if (row.items.some((item: any) => typeof item !== "string")) {
          issues.push(
            createIssue("configForm", "`list` 类型的 `items` 必须全部是字符串。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        }
        if (!isInteger(row.default)) {
          issues.push(
            createIssue("configForm", "`list` 类型的 `default` 必须是整数索引。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        } else if (Array.isArray(row.items) && (row.default < 0 || row.default >= row.items.length)) {
          issues.push(
            createIssue("configForm", "`list` 类型的 `default` 超出了 `items` 的索引范围。", {
              rowIndex: index,
              key,
            }),
          );
          rowHasError = true;
        }
        break;
    }

    if (!rowHasError) {
      switch (rowType) {
        case "string":
          rows.push({
            type: rowType,
            title,
            key,
            default: row.default,
          });
          break;
        case "integer":
          rows.push({
            type: rowType,
            title,
            key,
            default: row.default,
            min: row.min,
            max: row.max,
          });
          break;
        case "boolean":
          rows.push({
            type: rowType,
            title,
            key,
            default: row.default,
          });
          break;
        case "list":
          rows.push({
            type: rowType,
            title,
            key,
            default: row.default,
            items: row.items,
          });
          break;
      }
    }
  });

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
    configForm: rows,
    defaultConfig: issues.some((issue) => issue.severity === "error") ? undefined : buildDefaultConfig(rows),
  };
}

export function validateUserCustomServiceDraft(input: {
  scriptText: string;
  configFormText?: string;
}): UserCustomValidationResult {
  const scriptResult = validateUserCustomScriptText(input.scriptText);
  const configResult = validateUserCustomConfigFormText(input.configFormText ?? "");
  const issues = [...scriptResult.issues, ...configResult.issues];

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    issues,
    normalizedScriptText: scriptResult.normalizedScriptText,
    configForm: configResult.configForm,
    defaultConfig: configResult.defaultConfig,
  };
}

/**
 * 用户自定义 AI 翻译服务的验证方案：
 * 1. 保存前校验脚本是否为空、是否为匿名异步函数、是否存在语法错误。
 * 2. 保存前校验配置表单 JSON 的结构、字段类型、默认值和索引范围。
 * 3. 阻止重复 key、保留 key 和越界默认值进入数据库。
 * 4. 校验通过后返回标准化脚本、表单定义和默认配置对象，供保存逻辑直接复用。
 */
