import debug from 'debug';
import * as ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectService } from '../../src/create-program/createProjectService.js';
import { getParsedConfigFile } from '../../src/create-program/getParsedConfigFile.js';

// const mockGetParsedConfigFile = vi.fn();
const mockSetCompilerOptionsForInferredProjects = vi.fn();
const mockSetHostConfiguration = vi.fn();

vi.mock(
  import('../../src/create-program/getParsedConfigFile.js'),
  async () => ({
    getParsedConfigFile: vi.fn(),
  }),
);

vi.mock(import('typescript/lib/tsserverlibrary.js'), async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    server: {
      ...actual.server,
      ProjectService: class {
        eventHandler: ts.server.ProjectServiceEventHandler | undefined;
        host: ts.server.ServerHost;
        logger: ts.server.Logger;
        setCompilerOptionsForInferredProjects =
          mockSetCompilerOptionsForInferredProjects;
        setHostConfiguration = mockSetHostConfiguration;
        constructor(
          ...args: ConstructorParameters<typeof ts.server.ProjectService>
        ) {
          this.eventHandler = args[0].eventHandler;
          this.host = args[0].host;
          this.logger = args[0].logger;
          if (this.eventHandler) {
            this.eventHandler({
              eventName: 'projectLoadingStart',
            } as ts.server.ProjectLoadingStartEvent);
          }
        }
      },
    },
  } as unknown as Awaited<ReturnType<typeof importOriginal>>;
});

const mockGetParsedConfigFile = vi.mocked(getParsedConfigFile);
// const mockSetCompilerOptionsForInferredProjects = vi.mocked(
//   server.ProjectService.prototype.setCompilerOptionsForInferredProjects,
// );
// console.log(vi.isMockFunction(server.ProjectService.prototype.setCompilerOptionsForInferredProjects))
// vi.spyOn(server, 'ProjectService');
// vi.spyOn(server.ProjectService, 'prototype');
// const mockSetHostConfiguration = vi.mocked(
//   server.ProjectService.prototype.setHostConfiguration,
// );

// const {
//   createProjectService,
//   // eslint-disable-next-line @typescript-eslint/no-require-imports
// } = require('../../dist/create-program/createProjectService.js');
// require('../../src/create-program/createProjectService.js');
// import '../../src/create-program/createProjectService.js';

describe('createProjectService', () => {
  const processStderrWriteSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation(() => true);

  beforeEach(() => {
    mockGetParsedConfigFile.mockReturnValue({ options: {} });
  });

  afterEach(() => {
    // vi.clearAllMocks();
    processStderrWriteSpy.mockClear();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('sets allowDefaultProject when options.allowDefaultProject is defined', () => {
    const allowDefaultProject = ['./*.js'];
    const settings = createProjectService(
      { allowDefaultProject },
      undefined,
      undefined,
    );

    expect(settings.allowDefaultProject).toBe(allowDefaultProject);
  });

  it('does not set allowDefaultProject when options.allowDefaultProject is not defined', () => {
    const settings = createProjectService(undefined, undefined, undefined);

    expect(settings.allowDefaultProject).toBeUndefined();
  });

  it('does not throw an error when options.defaultProject is not provided and getParsedConfigFile throws a diagnostic error', () => {
    mockGetParsedConfigFile.mockImplementation(() => {
      throw new Error('tsconfig.json(1,1): error TS1234: Oh no!');
    });

    expect(() =>
      createProjectService(
        {
          allowDefaultProject: ['file.js'],
        },
        undefined,
        undefined,
      ),
    ).not.toThrowError();
  });

  it('throws an error with a relative path when options.defaultProject is set to a relative path and getParsedConfigFile throws a diagnostic error', () => {
    mockGetParsedConfigFile.mockImplementation(() => {
      throw new Error('./tsconfig.eslint.json(1,1): error TS1234: Oh no!');
    });

    expect(() =>
      createProjectService(
        {
          allowDefaultProject: ['file.js'],
          defaultProject: './tsconfig.eslint.json',
        },
        undefined,
        undefined,
      ),
    ).toThrowError(
      /Could not read project service default project '\.\/tsconfig.eslint.json': .+ error TS1234: Oh no!/,
    );
  });

  it('throws an error with a local path when options.defaultProject is set to a local path and getParsedConfigFile throws a diagnostic error', () => {
    mockGetParsedConfigFile.mockImplementation(() => {
      throw new Error('./tsconfig.eslint.json(1,1): error TS1234: Oh no!');
    });

    expect(() =>
      createProjectService(
        {
          allowDefaultProject: ['file.js'],
          defaultProject: 'tsconfig.eslint.json',
        },
        undefined,
        undefined,
      ),
    ).toThrowError(
      /Could not read project service default project 'tsconfig.eslint.json': .+ error TS1234: Oh no!/,
    );
  });

  it('throws an error when options.defaultProject is set and getParsedConfigFile throws an environment error', () => {
    mockGetParsedConfigFile.mockImplementation(() => {
      throw new Error(
        '`getParsedConfigFile` is only supported in a Node-like environment.',
      );
    });

    expect(() =>
      createProjectService(
        {
          allowDefaultProject: ['file.js'],
          defaultProject: 'tsconfig.json',
        },
        undefined,
        undefined,
      ),
    ).toThrow(
      "Could not read project service default project 'tsconfig.json': `getParsedConfigFile` is only supported in a Node-like environment.",
    );
  });

  it('uses the default project compiler options when options.defaultProject is set and getParsedConfigFile succeeds', () => {
    const compilerOptions = { strict: true };
    mockGetParsedConfigFile.mockReturnValue({ options: compilerOptions });
    const defaultProject = 'tsconfig.eslint.json';

    const { service } = createProjectService(
      {
        allowDefaultProject: ['file.js'],
        defaultProject,
      },
      undefined,
      undefined,
    );

    expect(mockSetCompilerOptionsForInferredProjects).toHaveBeenCalledWith(
      compilerOptions,
    );
    expect(mockGetParsedConfigFile).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('typescript/lib/tsserverlibrary'),
      defaultProject,
      undefined,
    );
  });

  it('uses tsconfigRootDir as getParsedConfigFile projectDirectory when provided', () => {
    const compilerOptions = { strict: true };
    const tsconfigRootDir = 'path/to/repo';
    mockGetParsedConfigFile.mockReturnValue({ options: compilerOptions });

    const { service } = createProjectService(
      {
        allowDefaultProject: ['file.js'],
      },
      undefined,
      tsconfigRootDir,
    );

    expect(mockSetCompilerOptionsForInferredProjects).toHaveBeenCalledWith(
      compilerOptions,
    );
    expect(mockGetParsedConfigFile).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('typescript/lib/tsserverlibrary.js'),
      'tsconfig.json',
      tsconfigRootDir,
    );
  });

  it('uses the default projects error debugger for error messages when enabled', () => {
    const { service } = createProjectService(undefined, undefined, undefined);
    debug.enable('typescript-eslint:typescript-estree:tsserver:err');
    const enabled = service.logger.loggingEnabled();
    service.logger.msg('foo', ts.server.Msg.Err);
    debug.disable();

    expect(enabled).toBe(true);
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^.*typescript-eslint:typescript-estree:tsserver:err .*foo/,
      ),
    );
  });

  it('does not use the default projects error debugger for error messages when disabled', () => {
    const { service } = createProjectService(undefined, undefined, undefined);
    const enabled = service.logger.loggingEnabled();
    service.logger.msg('foo', ts.server.Msg.Err);

    expect(enabled).toBe(false);
    expect(processStderrWriteSpy).toHaveBeenCalledTimes(0);
  });

  it('uses the default projects info debugger for info messages when enabled', () => {
    const { service } = createProjectService(undefined, undefined, undefined);
    debug.enable('typescript-eslint:typescript-estree:tsserver:info');
    const enabled = service.logger.loggingEnabled();
    service.logger.info('foo');
    debug.disable();

    expect(enabled).toBe(true);
    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^.*typescript-eslint:typescript-estree:tsserver:info .*foo/,
      ),
    );
  });

  it('does not use the default projects info debugger for info messages when disabled', () => {
    const { service } = createProjectService(undefined, undefined, undefined);
    const enabled = service.logger.loggingEnabled();
    service.logger.info('foo');

    expect(enabled).toBe(false);
    expect(processStderrWriteSpy).toHaveBeenCalledTimes(0);
  });

  it('uses the default projects perf debugger for perf messages when enabled', () => {
    const { service } = createProjectService(undefined, undefined, undefined);
    debug.enable('typescript-eslint:typescript-estree:tsserver:perf');
    const enabled = service.logger.loggingEnabled();
    service.logger.perftrc('foo');
    debug.disable();

    expect(enabled).toBe(true);
    expect(processStderrWriteSpy).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /^.*typescript-eslint:typescript-estree:tsserver:perf .*foo/,
      ),
    );
  });

  it('does not use the default projects perf debugger for perf messages when disabled', () => {
    const { service } = createProjectService(undefined, undefined, undefined);
    const enabled = service.logger.loggingEnabled();
    service.logger.perftrc('foo');

    expect(enabled).toBe(false);
    expect(processStderrWriteSpy).not.toHaveBeenCalled();
  });

  it('enables all log levels for the default projects logger', () => {
    const { service } = createProjectService(undefined, undefined, undefined);

    expect(service.logger.hasLevel(ts.server.LogLevel.terse)).toBe(true);
    expect(service.logger.hasLevel(ts.server.LogLevel.normal)).toBe(true);
    expect(service.logger.hasLevel(ts.server.LogLevel.requestTime)).toBe(true);
    expect(service.logger.hasLevel(ts.server.LogLevel.verbose)).toBe(true);
  });

  it('does not return a log filename with the default projects logger', () => {
    const { service } = createProjectService(undefined, undefined, undefined);

    expect(service.logger.getLogFileName()).toBeUndefined();
  });

  it('uses the default projects event debugger for event handling when enabled', () => {
    debug.enable('typescript-eslint:typescript-estree:tsserver:event');
    createProjectService(undefined, undefined, undefined);
    debug.disable();

    expect(processStderrWriteSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^.*typescript-eslint:typescript-estree:tsserver:event { eventName: 'projectLoadingStart' }\n$/,
      ),
    );
  });

  it('does not use the default projects event debugger for event handling when disabled', () => {
    createProjectService(undefined, undefined, undefined);

    expect(processStderrWriteSpy).not.toHaveBeenCalled();
  });

  it('provides a stub require to the host system when loadTypeScriptPlugins is falsy', () => {
    const { service } = createProjectService({}, undefined, undefined);

    const required = service.host.require();

    expect(required).toEqual({
      error: {
        message:
          'TypeScript plugins are not required when using parserOptions.projectService.',
      },
      module: undefined,
    });
  });

  it('does not provide a require to the host system when loadTypeScriptPlugins is truthy', async () => {
    const { service } = createProjectService(
      {
        loadTypeScriptPlugins: true,
      },
      undefined,
      undefined,
    );

    expect(service.host.require).toBe(
      (
        await vi.importActual<
          typeof import('typescript/lib/tsserverlibrary.js')
        >('typescript/lib/tsserverlibrary.js')
      ).sys.require,
    );
  });

  it('sets a host configuration', () => {
    const { service } = createProjectService(
      {
        allowDefaultProject: ['file.js'],
      },
      undefined,
      undefined,
    );

    expect(mockSetHostConfiguration).toHaveBeenCalledWith({
      preferences: {
        includePackageJsonAutoImports: 'off',
      },
    });
  });
});
