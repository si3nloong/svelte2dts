import fs from 'fs'
import path from 'path'

import { relPathJson } from './utils'
import { generateComponentDeclarations } from './lib'

async function* walk(dir: string): AsyncGenerator<string> {
  if (!fs.existsSync(dir)) {
    throw new Error(`srcDir: ${JSON.stringify(dir)} does not exist!`)
  }
  for await (const d of await fs.promises.opendir(dir)) {
    const entry = path.join(dir ,d.name)
    if (d.isDirectory()) yield* walk(entry)
    else if (d.isFile()) yield entry
  }
}

function conversionMsg(srcPath: string ,destPath: string ,dryRun: boolean) {
  return `${
    relPathJson(srcPath)
  } -> ${
    relPathJson(destPath)
  }.${
    dryRun ? ' (dry run)' : ''
  }`
}

interface PreprocessSvelteOptions {
  dryRun: boolean
  overwrite: boolean
  autoGenerate: boolean
  runOnTs: boolean
  runOnJs: boolean
  srcDirs: string[]
  outDir: string
  strict: boolean
  svelteExtensions: string[]
}

// eslint-disable-next-line import/prefer-default-export
export async function preprocessSvelte({
  dryRun = false
  ,overwrite = false
  ,autoGenerate = false
  ,outDir: outDirArg
  ,srcDirs: srcDirArgs
  ,svelteExtensions = ['.svelte']
  ,strict = false
  ,runOnTs = false
  ,runOnJs = false
}: PreprocessSvelteOptions): Promise<void> {
  const targetPaths: string[] = []
  const srcDirs = srcDirArgs
  const outDir = outDirArg
  const targetExtensions = [
    ...svelteExtensions
    ,...(runOnTs ? ['.ts' ,'.tsx'] : [])
    ,...(runOnJs ? ['.js' ,'.jsx'] : [])
  ]
  const isTargetPath = (filePath: string) => targetExtensions.some((ext) => filePath.endsWith(ext))
  for await (const srcDir of srcDirs) {
    for await (const filePath of walk(srcDir)) {
      if (isTargetPath(filePath)) {
        targetPaths.push(filePath)
      }
    }
  }
  const { extraFiles } = generateComponentDeclarations(
    targetPaths
    ,svelteExtensions
    ,srcDirs
    ,outDir
    ,strict
    ,(componentPath) => {
      if (!autoGenerate) return false
      return isTargetPath(componentPath)
    }
  )

  const createdFiles = new Map<string ,string>()
  for (const { virtualSourcePath: dest ,code: dtsCode } of extraFiles.values()) {
    if (!dest.startsWith(outDir)) throw new Error(`Attempt to create typing file outside of declarationdir! ${relPathJson(dest)}`)
    if (dtsCode === undefined) {
      console.error(`Failed to generate d.ts file ${relPathJson(dest)}`)
    }
    if (
      (fs.existsSync(dest) || createdFiles.has(dest))
       && !overwrite
    ) throw new Error(`Typing file ${relPathJson(dest)} already exists! (consider enabling '--overwrite')`)
    createdFiles.set(dest ,'')
  }

  // Write the d.ts files that we are interested in
  for (const { virtualSourcePath: dest ,code: dtsCode } of extraFiles.values()) {
    if (dtsCode === undefined) continue
    if (!dest.startsWith(outDir)) continue

    console.log(`Writing ${relPathJson(dest)}${dryRun ? ' (dry run)' : ''}`)
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest) ,{ recursive: true })
      fs.writeFileSync(dest ,dtsCode)
      // fs.writeFileSync(`${dest}.tsx` ,code)
    }
  }
}