import type {
  EditableCallMeta,
  EditableExecutionContext,
  EditableFunction,
  EditableViewState,
} from "./types.js";

export class EditableFunctionRegistry {
  private readonly tools = new Map<string, EditableFunction<any, any>>();

  constructor(tools: EditableFunction<any, any>[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: EditableFunction<any, any>): void {
    const existing = this.tools.get(tool.name);

    if (existing && existing !== tool) {
      throw new Error(`Editable tool "${tool.name}" is already registered.`);
    }

    this.tools.set(tool.name, tool);
  }

  get(name: string): EditableFunction<any, any> | undefined {
    return this.tools.get(name);
  }

  list(): EditableFunction<any, any>[] {
    return [...this.tools.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async call(
    name: string,
    input: unknown,
    args: {
      ctx: EditableExecutionContext;
      view: EditableViewState;
      meta: EditableCallMeta;
    },
  ): Promise<unknown> {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new Error(`Unknown editable tool "${name}".`);
    }

    const parsedInput = tool.parseInput(input);
    const output = await tool.run({ ...args, input: parsedInput });

    return tool.parseOutput(output);
  }
}

export function createMemoryEditableViewState(
  initial: Record<string, unknown> = {},
  onSet?: (key: string, value: unknown) => void | Promise<void>,
): EditableViewState {
  const state = { ...initial };

  return {
    state,
    get<T = unknown>(key: string): T | undefined {
      return state[key] as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      state[key] = value;
      await onSet?.(key, value);
    },
    toJSON(): Record<string, unknown> {
      return { ...state };
    },
  };
}
