export type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>;
};

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

type PluralSuffix = '_zero' | '_one' | '_two' | '_few' | '_many' | '_other';

type CollapsePlural<K extends string> = K extends `${infer Base}${PluralSuffix}`
  ? Base
  : K;

export type MessageKey<M> = CollapsePlural<Leaves<M>>;
