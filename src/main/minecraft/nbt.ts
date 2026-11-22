export type NbtTagType =
  | 'end'
  | 'byte'
  | 'short'
  | 'int'
  | 'long'
  | 'float'
  | 'double'
  | 'byteArray'
  | 'string'
  | 'list'
  | 'compound'
  | 'intArray'
  | 'longArray'

export interface NbtTag {
  type: NbtTagType
  value?: unknown
  listType?: NbtTagType
  name?: string
}

const TAG_IDS: Record<NbtTagType, number> = {
  end: 0,
  byte: 1,
  short: 2,
  int: 3,
  long: 4,
  float: 5,
  double: 6,
  byteArray: 7,
  string: 8,
  list: 9,
  compound: 10,
  intArray: 11,
  longArray: 12
}

const ID_TAGS: NbtTagType[] = [
  'end',
  'byte',
  'short',
  'int',
  'long',
  'float',
  'double',
  'byteArray',
  'string',
  'list',
  'compound',
  'intArray',
  'longArray'
]

const MAX_DEPTH = 12
const MAX_ELEMENTS = 200_000
const MAX_STRING = 4 * 1024 * 1024

class Reader {
  readonly view: DataView
  readonly bytes: Uint8Array
  offset = 0

  constructor(buffer: Buffer) {
    this.bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  }

  private ensure(length: number): void {
    if (length < 0 || this.offset + length > this.view.byteLength) {
      throw new Error('NBT truncado o fuera de rango')
    }
  }

  u8(): number {
    this.ensure(1)
    return this.view.getUint8(this.offset++)
  }

  i8(): number {
    this.ensure(1)
    return this.view.getInt8(this.offset++)
  }

  i16(): number {
    this.ensure(2)
    const value = this.view.getInt16(this.offset, false)
    this.offset += 2
    return value
  }

  i32(): number {
    this.ensure(4)
    const value = this.view.getInt32(this.offset, false)
    this.offset += 4
    return value
  }

  i64(): bigint {
    this.ensure(8)
    const value = this.view.getBigInt64(this.offset, false)
    this.offset += 8
    return value
  }

  f32(): number {
    this.ensure(4)
    const value = this.view.getFloat32(this.offset, false)
    this.offset += 4
    return value
  }

  f64(): number {
    this.ensure(8)
    const value = this.view.getFloat64(this.offset, false)
    this.offset += 8
    return value
  }

  string(): string {
    const length = this.view.getUint16(this.offset, false)
    this.offset += 2
    if (length > MAX_STRING) throw new Error('Cadena NBT demasiado larga')
    this.ensure(length)
    const value = Buffer.from(this.bytes.subarray(this.offset, this.offset + length)).toString('utf8')
    this.offset += length
    return value
  }

  payload(type: NbtTagType, depth: number): NbtTag {
    if (depth > MAX_DEPTH) throw new Error('NBT demasiado profundo')
    switch (type) {
      case 'end':
        return { type: 'end' }
      case 'byte':
        return { type, value: this.i8() }
      case 'short':
        return { type, value: this.i16() }
      case 'int':
        return { type, value: this.i32() }
      case 'long':
        return { type, value: this.i64() }
      case 'float':
        return { type, value: this.f32() }
      case 'double':
        return { type, value: this.f64() }
      case 'string':
        return { type, value: this.string() }
      case 'byteArray': {
        const length = this.i32()
        if (length < 0 || length > MAX_ELEMENTS) throw new Error('byteArray NBT inválido')
        this.ensure(length)
        const value = Array.from(this.bytes.subarray(this.offset, this.offset + length))
        this.offset += length
        return { type, value }
      }
      case 'intArray': {
        const length = this.i32()
        if (length < 0 || length > MAX_ELEMENTS) throw new Error('intArray NBT inválido')
        const value: number[] = []
        for (let index = 0; index < length; index += 1) value.push(this.i32())
        return { type, value }
      }
      case 'longArray': {
        const length = this.i32()
        if (length < 0 || length > MAX_ELEMENTS) throw new Error('longArray NBT inválido')
        const value: bigint[] = []
        for (let index = 0; index < length; index += 1) value.push(this.i64())
        return { type, value }
      }
      case 'list': {
        const listType = ID_TAGS[this.u8()]
        if (!listType) throw new Error('Tipo de lista NBT inválido')
        const length = this.i32()
        if (length < 0 || length > MAX_ELEMENTS) throw new Error('list NBT inválida')
        const value: NbtTag[] = []
        for (let index = 0; index < length; index += 1) value.push(this.payload(listType, depth + 1))
        return { type, listType, value }
      }
      case 'compound': {
        const value: Record<string, NbtTag> = {}
        for (let index = 0; index < MAX_ELEMENTS; index += 1) {
          const id = this.u8()
          const tagType = ID_TAGS[id]
          if (!tagType) throw new Error('Tipo NBT desconocido')
          if (tagType === 'end') break
          const name = this.string()
          value[name] = this.payload(tagType, depth + 1)
        }
        return { type, value }
      }
      default:
        throw new Error('Tipo NBT no soportado')
    }
  }
}

export function parseNbt(buffer: Buffer): NbtTag {
  const reader = new Reader(buffer)
  const id = reader.u8()
  const type = ID_TAGS[id]
  if (type !== 'compound') throw new Error('La raíz NBT debe ser un compuesto')
  const name = reader.string()
  const tag = reader.payload(type, 0)
  tag.name = name
  return tag
}

function idOf(type: NbtTagType): number {
  const id = TAG_IDS[type]
  if (id === undefined) throw new Error('Tipo NBT no soportado')
  return id
}

function writeString(value: string): Buffer {
  const data = Buffer.from(value, 'utf8')
  if (data.length > 0xffff) throw new Error('Cadena NBT demasiado larga')
  const head = Buffer.alloc(2)
  head.writeUInt16BE(data.length, 0)
  return Buffer.concat([head, data])
}

function writePayload(tag: NbtTag): Buffer {
  switch (tag.type) {
    case 'byte': {
      const buffer = Buffer.alloc(1)
      buffer.writeInt8(Number(tag.value ?? 0), 0)
      return buffer
    }
    case 'short': {
      const buffer = Buffer.alloc(2)
      buffer.writeInt16BE(Number(tag.value ?? 0), 0)
      return buffer
    }
    case 'int': {
      const buffer = Buffer.alloc(4)
      buffer.writeInt32BE(Number(tag.value ?? 0), 0)
      return buffer
    }
    case 'long': {
      const buffer = Buffer.alloc(8)
      const raw = tag.value
      buffer.writeBigInt64BE(
        typeof raw === 'bigint' ? raw : BigInt(typeof raw === 'number' ? raw : 0),
        0
      )
      return buffer
    }
    case 'float': {
      const buffer = Buffer.alloc(4)
      buffer.writeFloatBE(Number(tag.value ?? 0), 0)
      return buffer
    }
    case 'double': {
      const buffer = Buffer.alloc(8)
      buffer.writeDoubleBE(Number(tag.value ?? 0), 0)
      return buffer
    }
    case 'string':
      return writeString(String(tag.value ?? ''))
    case 'byteArray': {
      const values = Array.isArray(tag.value) ? (tag.value as number[]) : []
      const head = Buffer.alloc(4)
      head.writeInt32BE(values.length, 0)
      return Buffer.concat([head, Buffer.from(values.map((value) => value & 0xff))])
    }
    case 'intArray': {
      const values = Array.isArray(tag.value) ? (tag.value as number[]) : []
      const head = Buffer.alloc(4)
      head.writeInt32BE(values.length, 0)
      const body = Buffer.alloc(values.length * 4)
      values.forEach((value, index) => body.writeInt32BE(value, index * 4))
      return Buffer.concat([head, body])
    }
    case 'longArray': {
      const values = Array.isArray(tag.value) ? (tag.value as bigint[]) : []
      const head = Buffer.alloc(4)
      head.writeInt32BE(values.length, 0)
      const body = Buffer.alloc(values.length * 8)
      values.forEach((value, index) => body.writeBigInt64BE(BigInt(value), index * 8))
      return Buffer.concat([head, body])
    }
    case 'list': {
      const listType = tag.listType ?? 'end'
      const values = Array.isArray(tag.value) ? (tag.value as NbtTag[]) : []
      const head = Buffer.alloc(5)
      head.writeUInt8(idOf(listType), 0)
      head.writeInt32BE(values.length, 1)
      return Buffer.concat([head, ...values.map((value) => writePayload({ ...value, type: listType }))])
    }
    case 'compound': {
      const value = (tag.value ?? {}) as Record<string, NbtTag>
      const parts: Buffer[] = []
      for (const [name, child] of Object.entries(value)) {
        parts.push(Buffer.from([idOf(child.type)]))
        parts.push(writeString(name))
        parts.push(writePayload(child))
      }
      parts.push(Buffer.from([0]))
      return Buffer.concat(parts)
    }
    default:
      throw new Error('No se puede escribir un tipo NBT no soportado')
  }
}

export function writeNbt(root: NbtTag, name = ''): Buffer {
  if (root.type !== 'compound') throw new Error('La raíz NBT debe ser un compuesto')
  return Buffer.concat([Buffer.from([idOf('compound')]), writeString(name), writePayload(root)])
}

export function compound(value: Record<string, NbtTag>): NbtTag {
  return { type: 'compound', value }
}

export function nbtString(value: string): NbtTag {
  return { type: 'string', value }
}

export function nbtByte(value: number): NbtTag {
  return { type: 'byte', value }
}

export function nbtList(listType: NbtTagType, value: NbtTag[]): NbtTag {
  return { type: 'list', listType, value }
}
