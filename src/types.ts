export type Row = Record<string,string|number|null>;
export type MapLocal = Row & {latitude:number|null;longitude:number|null;status:string};
export type MapLocations = {items:MapLocal[];total:number;mapeados:number};
