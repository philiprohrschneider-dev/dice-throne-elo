export const NEW = 'new'

export interface PickValue {
  /** Player id, NEW for "create a new player", or '' for nothing chosen. */
  choice: string
  newName: string
}

export const emptyPick: PickValue = { choice: '', newName: '' }

