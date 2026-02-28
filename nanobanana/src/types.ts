export interface MultiViewImages {
  front: string;
  right: string;
  back: string;
  left: string;
  gridUrl?: string;
}

export interface GenerateRequest {
  buildingName: string;
}

export interface GenerateResponse {
  views: MultiViewImages;
}
