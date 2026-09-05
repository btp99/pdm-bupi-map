export interface WmsLayerDef {
  id: string;
  label: string;
  wmsBase: string;
  wmsOptions: Record<string, unknown>;
  defaultOn?: boolean;
}

export interface MunicipalityConfig {
  id: string;
  name: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
  pdmLayers: WmsLayerDef[];
  hasLocalTiles: boolean;
}

const AGUIAR_WMS = 'https://sig.cm-aguiardabeira.pt/0901/qgis_mapserv.fcgi?';
const TRANCOSO_WMS = 'https://sigamcb.wkt.pt/geoserver/cm_trancoso/wms';

const AGUIAR_BASE = { format: 'image/png', transparent: true, version: '1.3.0', map: 'pdm_db.qgs' };
const TRANCOSO_BASE = { format: 'image/png', transparent: true, version: '1.3.0' };

function aguiar(layers: string, label: string, defaultOn?: boolean): WmsLayerDef {
  return { id: layers, label, wmsBase: AGUIAR_WMS, wmsOptions: { ...AGUIAR_BASE, layers }, defaultOn };
}

function trancoso(layers: string, label: string, styles: string, defaultOn?: boolean): WmsLayerDef {
  return { id: layers, label, wmsBase: TRANCOSO_WMS, wmsOptions: { ...TRANCOSO_BASE, layers, styles }, defaultOn };
}

export const MUNICIPALITIES: MunicipalityConfig[] = [
  {
    id: 'aguiar',
    name: 'Aguiar da Beira',
    center: [40.816, -7.544],
    zoom: 13,
    hasLocalTiles: true,
    pdmLayers: [
      aguiar('ran', 'RAN', true),
      aguiar('ren', 'REN', true),
      aguiar('trocoaltatensao', 'Rede Elétrica AT'),
      aguiar('trocomediatensao', 'Rede Elétrica MT'),
      aguiar('condutaadutora_adutoradistribuidora', 'Conduta Adutora'),
      aguiar('espacosagricolasdeproducao', 'Espaços Agrícolas'),
      aguiar('espacosurbanosdebaixadensidade1', 'Solo Urbano Baixa Densidade I'),
      aguiar('espacosurbanosdebaixadensidade2', 'Solo Urbano Baixa Densidade II'),
      aguiar('espacosverdes', 'Espaços Verdes'),
      aguiar('espacosdeatividadeseconomicas', 'Espaços Atividades Económicas'),
      aguiar('espacoderecursosgeologicos', 'Recursos Geológicos'),
      aguiar('espacoderecursosgeologicos_CM', 'Recursos Geológicos CM'),
      aguiar('espacoderecursosgeologicos_U', 'Recursos Geológicos U'),
      aguiar('espacoderecursosgeologicos_R', 'Recursos Geológicos R'),
      aguiar('espacosdeusosmultiplos', 'Espaços Usos Múltiplos'),
      aguiar('estruturaecologicamunicipal', 'Estrutura Ecológica Municipal'),
      aguiar('linhasdeagua', 'Linhas de Água'),
    ],
  },
  {
    id: 'trancoso',
    name: 'Trancoso',
    center: [40.779, -7.351],
    zoom: 13,
    hasLocalTiles: false,
    pdmLayers: [
      // Condicionantes
      trancoso('ran_final', 'RAN', 'Reserva_Agricola_Nacional', true),
      trancoso('REN_Trancoso', 'REN', 'default-style-REN_Trancoso', true),
      trancoso('rede_eletrica', 'Rede Elétrica AT', 'Rede_Eletrica_AT'),
      trancoso('rede_eletrica_rnt', 'Rede Elétrica MAT', 'Rede_Eletrica_MAT'),
      trancoso('0913_ca', 'Cursos de Água', 'linhas_cursos_agua'),
      trancoso('0913_lca', 'Leitos de Cursos de Água', 'leitos_cursos_agua'),
      trancoso('0913_margens', 'Margens de Cursos de Água', 'margens_cursos_agua'),
      trancoso('0913_alb', 'Albufeiras', 'albufeira'),
      trancoso('0913_alb_faixa', 'Faixa Proteção Albufeiras', 'faixa_protecao_albufeira'),
      trancoso('0913_alb_margem', 'Margem Albufeiras', 'margem_albufeira'),
      trancoso('0913_zac', 'Zonas Ameaçadas por Cheias', 'zonas_ameacadas_cheias'),
      trancoso('0913_aiv', 'Instabilidade de Vertentes', 'aiv'),
      trancoso('0913_zna', 'Zona Non Aedificandi', 'Zona_Servidao_non_aedificandi'),
      trancoso('0913_aeipra', 'AEIPRA', '0913_aeipra'),
      trancoso('0913_aerehs', 'AEREHS', '0913_aerehs'),
      trancoso('0913_uopg', 'UOPG', 'unidades operativas de PG'),
      trancoso('fgc_2022', 'Faixas Gestão Combustível', 'rfgc'),
      trancoso('pif0913', 'Perigosidade de Incêndio', 'pif'),
      trancoso('rpa_2022', 'RPA', 'rpa'),
      trancoso('rvf_2022', 'RVF', 'rvf'),
      trancoso('alb_teja_zona_protecao', 'Alb. Teja — Zona Proteção', 'ALB_Teja_zona_protecao'),
      trancoso('alb_teja_zona_reservada', 'Alb. Teja — Zona Reservada', 'ALB_Teja_zona_reservada'),
      trancoso('concessao_mineira', 'Concessão Mineira', 'Concessao_Mineira'),
      trancoso('Patrimonio_classificado1', 'Património Classificado', 'patrimonio_classificado'),
      trancoso('zonas_protec_patrim_classificado', 'Zonas Proteção Património', ''),
      trancoso('ppscht_limite', 'PPSCHT', 'PPSHT'),
      // Ordenamento
      trancoso('rpdm_trancoso_esp_agricolas', 'Espaços Agrícolas', 'Espacos_Agricolas'),
      trancoso('rpdm_trancoso_esp_florestais', 'Espaços Florestais', 'Espacos_Florestais'),
      trancoso('rpdm_trancoso_esp_naturais', 'Espaços Naturais', 'Espacos_Naturais_Paisagisticos'),
      trancoso('rpdm_trancoso_esp_culturais', 'Espaços Culturais', 'Espacos_Culturais'),
      trancoso('rpdm_trancoso_esp_equip', 'Espaços Equipamentos', 'Espacos_Uso_Especial_Equipamentos'),
      trancoso('rpdm_trancoso_aglomerados_rurais', 'Aglomerados Rurais', 'Aglomerados_Rurais'),
      trancoso('rpdm_trancoso_solo_urbano_qualific', 'Solo Urbano', 'solo_urbano'),
      trancoso('rpdm_trancoso_exp_rec_geologicos', 'Recursos Geológicos', 'Espacos_Exploracao_RecEnergeticos_Geologicos'),
      trancoso('estr_urba_con', 'Estrutura Urbana a Consolidar', 'Areas_Estrutura_Urbana_Consolidar'),
    ],
  },
];

export const DEFAULT_MUNICIPALITY_ID = 'aguiar';
