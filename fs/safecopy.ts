import { type Integer, isString } from '@epdoc/type';
import type * as dfs from 'jsr:@std/fs';
import { FileSpec } from './filespec.ts';
import { FolderSpec } from './folderspec.ts';
import { FSSpec } from './fsspec.ts';
import { SymlinkSpec } from './symspec.ts';
import type { FilePath } from './types.ts';

/**
 * Represents the possible conflict resolution strategies for a file.
 */
export type FileConflictStrategy =
  | { type: 'renameWithTilde'; errorIfExists?: boolean }
  | { type: 'renameWithNumber'; separator?: string; limit?: Integer; errorIfExists?: boolean }
  | { type: 'overwrite'; errorIfExists?: boolean }
  | { type: 'error'; errorIfExists?: boolean };

/**
 * A mapping of conflict strategy types to their string representations.
 */
export const fileConflictStrategyType = {
  renameWithTilde: 'renameWithTilde',
  renameWithNumber: 'renameWithNumber',
  overwrite: 'overwrite',
  error: 'error',
} as const;

/**
 * Type representing the possible conflict strategy types.
 * This type is derived from the keys of the `fileConflictStrategyType` object.
 */
export type FileConflictStrategyType = (typeof fileConflictStrategyType)[keyof typeof fileConflictStrategyType];

/**
 * Checks if a given value is a valid FileConflictStrategyType.
 *
 * @param value The value to check.
 * @returns True if the value is a valid FileConflictStrategyType, false otherwise.
 */
export function isFileConflictStrategyType(value: unknown): value is FileConflictStrategyType {
  return typeof value === 'string' && value in Object.keys(fileConflictStrategyType);
}

/**
 * Represents the options for the safeCopy method.
 */
export type SafeCopyOpts = {
  /**
   * Whether to move or copy the file.
   */
  move?: boolean;
  /**
   * The strategy to use when a file with the same name already exists.
   */
  conflictStrategy?: FileConflictStrategy;
  /**
   * Whether to ensure the parent directories exist before the operation.
   */
  ensureParentDirs?: boolean;
  /**
   * Don't actually move or copy the file, just execute the logic around it
   */
  test?: boolean;
};

// function toFileOrFolderSpec(
//   fs: FSSpec | FolderSpec | FileSpec | string,
// ): Promise<FSSpec | FolderSpec | FileSpec | SymlinkSpec> {
//   if (fs instanceof FileSpec || fs instanceof FolderSpec) {
//     return Promise.resolve(fs);
//   } else if (isString(fs)) {
//     return new FSSpec(fs).getResolvedType().then((resp) => {
//       if (resp instanceof FileSpec || resp instanceof FolderSpec) {
//         return Promise.resolve(resp);
//       }
//       throw new Error('Invalid safeCopy destination');
//     });
//   } else if (fs instanceof FSSpec) {
//     return fs.getResolvedType();
//   } else {
//     throw new Error('Invalid safeCopy destination');
//   }
// }

/**
 * Copy an existing file or directory to a new location. Optionally creates a
 * backup if there is an existing file or directory at `destFile`.
 * @param {FilePath | BaseSpec} destFile - The destination file or directory.
 * @param {SafeCopyOpts} [opts={}] - Options for the copy or move operation.
 * @returns {Promise<boolean | undefined>} A promise that resolves with true if the file was copied or moved, false otherwise.
 */
export function safeCopy(
  srcFile: FSSpec | FileSpec | FolderSpec,
  destFile: FilePath | FileSpec | FolderSpec | FSSpec,
  opts: SafeCopyOpts = {},
): Promise<boolean> {
  let fsSrc: FileSpec | FolderSpec;
  let fsDest: FSSpec | FileSpec | FolderSpec = isString(destFile) ? new FSSpec(destFile) : destFile;
  return Promise.resolve()
    .then(() => {
      if (srcFile instanceof FSSpec) {
        return srcFile.getResolvedType();
      } else {
        return Promise.resolve(srcFile) as Promise<FSSpec | FolderSpec | FileSpec | SymlinkSpec>;
      }
    })
    .then((resolvedType: FSSpec | FolderSpec | FileSpec | SymlinkSpec) => {
      if (resolvedType instanceof FileSpec || resolvedType instanceof FolderSpec) {
        fsSrc = resolvedType;
        return fsSrc.getExists();
      } else {
        throw new Error('Invalid safeCopy source');
      }
    })
    .then((srcExists: boolean | undefined) => {
      if (srcExists !== true) {
        throw new Error('Does not exist: ' + srcFile.path);
      }
    })
    .then(() => {
      if (fsDest instanceof FSSpec) {
        return fsDest.getResolvedType();
      } else {
        return Promise.resolve(fsDest);
      }
    })
    .then((resp: FSSpec | FolderSpec | FileSpec | SymlinkSpec) => {
      if (resp instanceof SymlinkSpec) {
        throw new Error('safeCopy destination cannot be a symlink');
      }
      fsDest = resp;
      if (fsDest instanceof FileSpec) {
        if (fsDest.exists()) {
          return fsDest
            .backup(opts.conflictStrategy)
            .then((newPath: FilePath) => {
              if (opts.move) {
                return srcFile.moveTo(newPath, { overwrite: true });
              } else {
                return srcFile.copyTo(newPath, { overwrite: true });
              }
            })
            .then(() => {
              return Promise.resolve(true);
            });
        } else {
          const copyOpts: dfs.CopyOptions = getCopyOpts(opts);
          if (opts.move) {
            return srcFile.moveTo(fsDest, copyOpts);
          } else {
            return srcFile.copyTo(fsDest, copyOpts);
          }
        }
      } else {
        const copyOpts: dfs.CopyOptions = getCopyOpts(opts);
        if (opts.move) {
          return srcFile.moveTo(fsDest.path, copyOpts).then(() => {
            return Promise.resolve(true);
          });
        } else {
          return srcFile.copyTo(fsDest.path, copyOpts).then(() => {
            return Promise.resolve(true);
          });
        }
      }
    })
    .then((_resp) => {
      return Promise.resolve(true);
    });
}

function getCopyOpts(opts: SafeCopyOpts): dfs.CopyOptions {
  const copyOpts: dfs.CopyOptions = { preserveTimestamps: true };
  if (opts.conflictStrategy === 'overwrite') {
    copyOpts.overwrite = true;
  }
  return copyOpts;
}
