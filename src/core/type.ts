export type ProductType = 'base' | 'glass' | 'earrings';

export type CatalogConfigItem = {
  label: string;
  icon?: string;
  visible: boolean;
  enableSearch: boolean;
  itemLimits: number;
  productType: ProductType;
  productName: string;
  pageSize?: number;
  totalItems?: number;
};

export type EditorConfig = {
  baseModelUrl: string;
  projectUrl: string;
  projectName: string;
  catalogConfig: CatalogConfigItem[];
};

export type ExportModelSuccess = (data: {
  file: Blob;
  objFormat: 'stl' | 'obj';
  fileFormat: 'stl';
  zip?: Blob;
}) => void;

export type ExportProjectSuccess = (data: { file: Blob; fileFormat: 'zip' }) => void;

export type ProjectNameSuccess = (result: { name: string; oldName: string }) => void;

export type RequestData = {
  productType: ProductType;
  page: number;
};

export type ModelInfo = {
  id: string;
  name?: string;
  [key: string]: CoreValue;
};

export type ModelData = Record<ProductType, ModelInfo[]>;
