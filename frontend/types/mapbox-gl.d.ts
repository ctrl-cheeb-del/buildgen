// Stub declarations for mapbox-gl transitive type dependencies
// These packages exist in node_modules/@types but are missing index.d.ts
declare module "@mapbox/point-geometry" {
  class Point {
    x: number;
    y: number;
    constructor(x: number, y: number);
  }
  export = Point;
}

declare module "@mapbox/vector-tile" {
  export class VectorTile {
    layers: Record<string, VectorTileLayer>;
    constructor(buf: ArrayBuffer);
  }
  export class VectorTileLayer {
    length: number;
    feature(i: number): VectorTileFeature;
  }
  export class VectorTileFeature {
    type: number;
    extent: number;
    id: number;
    properties: Record<string, string | number | boolean>;
    loadGeometry(): Array<Array<{ x: number; y: number }>>;
    toGeoJSON(x: number, y: number, z: number): GeoJSON.Feature;
  }
}
