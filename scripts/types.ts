export interface Manifest {
  name: string
  description: string
  version: string
  groups: ManifestGroup[]
  examples: ManifestExample[]
}

export interface ManifestGroup {
  id: string
  title: string
  accentColor: string
  category: string
  description: string
  flags: string[]
}

export interface ManifestExample {
  slug: string
  id: string
  title: string
  accentColor: string
  category: string
  stack: string
  description: string
  flags: string[]
  directory: string
  language: string
  shorthand: string
  template: string
  groupId?: string
  docs: string
  thumbnail?: string
}
