// Dados da análise do sítio do Cume (freguesia de Carapito, Aguiar da Beira).
// Fontes: cadernetas prediais (Finanças), Informação Predial Simplificada
// (Conservatória) e processos BUPi consultados no IRN.

export type GroupId = 'cume-registo' | 'cume' | 'quelha' | 'deserto' | 'boicas';

export const GROUPS: Record<GroupId, { label: string; color: string }> = {
  'cume-registo': { label: 'Cume · com registo predial', color: '#dc2626' },
  cume: { label: 'Cume · BUPi', color: '#f59e0b' },
  quelha: { label: 'Quelha do Pinheiro', color: '#2563eb' },
  deserto: { label: 'Deserto', color: '#a855f7' },
  boicas: { label: 'Boiças', color: '#10b981' },
};

export const NEIGHBOUR_COLOR = '#cbd5e1';
export const ZONE_COLOR = '#ffffff';
export const GAP_COLOR = '#22d3ee';
export const INTERP_COLOR = '#facc15';

export interface Confrontacoes {
  norte?: string;
  sul?: string;
  nascente?: string;
  poente?: string;
}

export interface DocInfo {
  titular?: string;
  areaDoc?: string;
  confrontacoes?: Confrontacoes;
  nota?: string;
}

export interface KnownParcel {
  artigo: number;
  processo: number;
  group: GroupId;
  doc?: DocInfo;
}

export const KNOWN_PARCELS: KnownParcel[] = [
  // Cume com registo predial
  {
    artigo: 2458, processo: 4584149, group: 'cume-registo',
    doc: {
      titular: 'Herdeiros Matos de Andrade (sucessão 1997)',
      areaDoc: '2 400 m²',
      confrontacoes: { norte: 'António Andrade', nascente: 'Herd. de António Moreira', sul: 'Herd. de António Moreira', poente: 'Margarida Rosa' },
    },
  },
  {
    artigo: 2459, processo: 3113640, group: 'cume-registo',
    doc: {
      titular: 'Virgílio Augusto Caseiro e Maria Josefa dos Reis (usucapião 2001)',
      areaDoc: '16 800 m²',
      confrontacoes: { norte: 'Francisco Lopes', nascente: 'Luís Marques', sul: 'Margarida Rosa', poente: 'Junta de Freguesia de Eirado' },
    },
  },
  {
    artigo: 2444, processo: 2975806, group: 'cume-registo',
    doc: {
      titular: 'Ana Maria e António José Genésio (entre outros)',
      areaDoc: '8 298 m²',
      confrontacoes: { norte: 'Margarida Rosa', sul: 'António Isidro', nascente: 'Sebastião Moreira', poente: 'Casimiro Andrade' },
      nota: 'Confronta a nascente com Sebastião Moreira, o vizinho comum de 2403, 2446 e 2448.',
    },
  },
  {
    artigo: 2442, processo: 1111650, group: 'cume-registo',
    doc: {
      titular: 'Ilídio Pinto e Ana Márcia Baltazar Pinto',
      areaDoc: '2 700 m²',
      confrontacoes: { norte: 'Aníbal Frias', nascente: 'Ernesto Dias', sul: 'Maria Pinto', poente: 'Limite do Eirado' },
      nota: 'Ernesto Dias também é o vizinho poente do 2446; "Limite do Eirado" também é o poente do 2403.',
    },
  },
  {
    artigo: 2450, processo: 4688277, group: 'cume-registo',
    doc: {
      titular: 'Vasco Sousa de Almeida, ½ (partilha 2026)',
      areaDoc: '7 200 m²',
      confrontacoes: { norte: 'Herd. de Jeremias Caseiro', nascente: 'Joaquim Lopes', sul: 'António Sousa e outros', poente: 'António Sousa' },
    },
  },
  {
    artigo: 2449, processo: 1889941, group: 'cume-registo',
    doc: {
      titular: 'Fernando Matos Sousa (antes António de Sousa)',
      areaDoc: '9 400 m²',
      confrontacoes: { norte: 'Herd. de António Moreira', sul: 'Alberto Moreira', nascente: 'Margarida Rosa', poente: 'Alberto Moreira' },
      nota: 'António de Sousa, o antigo dono, é o vizinho sul do 2446.',
    },
  },
  {
    artigo: 2596, processo: 1592040, group: 'cume-registo',
    doc: {
      titular: 'António Francisco dos Santos Caetano',
      areaDoc: '1 906 m²',
      confrontacoes: { norte: 'António Moreira', sul: 'Rita Elizabete do Espírito Santo', nascente: 'Francisco Menano', poente: 'Herd. de António Moreira' },
    },
  },
  // Cume (só BUPi)
  { artigo: 2399, processo: 2537743, group: 'cume' },
  { artigo: 2433, processo: 2679528, group: 'cume' },
  { artigo: 2410, processo: 721221, group: 'cume' },
  { artigo: 2404, processo: 580991, group: 'cume' },
  { artigo: 2439, processo: 721316, group: 'cume' },
  { artigo: 2406, processo: 721181, group: 'cume' },
  // Outras localidades
  { artigo: 1579, processo: 1564473, group: 'quelha' },
  { artigo: 1596, processo: 1591936, group: 'quelha' },
  { artigo: 1508, processo: 1052350, group: 'deserto' },
  { artigo: 2432, processo: 3113568, group: 'boicas' },
];

export interface TargetParcel {
  artigo: number;
  areaM2: number;
  titular: string;
  confrontacoes: Confrontacoes;
}

// Terrenos de José Pedro Pinto: sem georreferenciação conhecida.
export const TARGET_PARCELS: TargetParcel[] = [
  {
    artigo: 2403, areaM2: 19948, titular: 'José Pedro Pinto',
    confrontacoes: { norte: 'Luís Tavares', sul: 'Sebastião Moreira', nascente: 'Isabel Cardoso', poente: 'Limite do Eirado' },
  },
  {
    artigo: 2437, areaM2: 2420, titular: 'José Pedro Pinto',
    confrontacoes: { norte: 'Umbelina Barranha', sul: 'Amélia Barranha', nascente: 'Joaquim dos Santos', poente: 'Pedro do Nascimento' },
  },
  {
    artigo: 2446, areaM2: 9400, titular: 'José Pedro Pinto SA',
    confrontacoes: { norte: 'Sebastião Moreira', sul: 'António de Sousa', nascente: 'Herd. de António Moreira', poente: 'Ernesto Dias' },
  },
  {
    artigo: 2448, areaM2: 17912, titular: 'José Pedro Pinto',
    confrontacoes: { norte: 'Afonso Artur Paixão', sul: 'Alberto de Sousa Moreira', nascente: 'Francisco Barranha', poente: 'Sebastião Moreira' },
  },
];

// Confrontações que já correspondem a uma parcela registada: não geram hipótese.
export const RESOLVED_CONSTRAINTS: { artigo: number; side: keyof Confrontacoes; resolvedTo: number; nota: string }[] = [
  { artigo: 2449, side: 'nascente', resolvedTo: 2450, nota: 'Margarida Rosa vendeu o 2450 em 2026' },
  { artigo: 2450, side: 'poente', resolvedTo: 2449, nota: 'António Sousa era o dono do 2449' },
  { artigo: 2450, side: 'sul', resolvedTo: 2449, nota: 'António Sousa era o dono do 2449' },
];

// Nomes que se referem ao mesmo vizinho / mesma família (o primeiro nome é a chave).
export const NAME_GROUPS: { label: string; names: string[] }[] = [
  { label: 'António Moreira (e herdeiros)', names: ['António Moreira', 'Herd. de António Moreira'] },
];

// Largura (m) da faixa encostada a cada lado de uma parcela, nas hipóteses por confrontação.
export const DEFAULT_BAND_M = 80;

export const HYPOTHESIS_COLORS = [
  '#e879f9', '#fb7185', '#a3e635', '#38bdf8', '#fbbf24', '#c084fc', '#4ade80', '#f472b6', '#2dd4bf', '#fdba74',
];

export const DICOFRE_CARAPITO = '090102';
// Artigos vizinhos usados para contexto e interpolação pela numeração da matriz.
export const MATRIX_RANGE: [number, number] = [2380, 2470];
// Distância máxima (em números de artigo) usada na interpolação.
export const INTERP_WINDOW = 4;

export const FINDINGS: string[] = [
  'Os artigos do Cume estão todos no mesmo núcleo, a nascente do limite com a freguesia de Eirado. A numeração da matriz de 1976 segue mais ou menos a ordem no terreno.',
  'O 2444 confronta a nascente com Sebastião Moreira. Sebastião Moreira também é vizinho do 2403 (a sul), do 2446 (a norte) e do 2448 (a poente). Por isso, o núcleo dos terrenos de José Pedro Pinto deve começar logo a nascente do 2444.',
  'O 2442 tem Ernesto Dias a nascente e o 2446 tem Ernesto Dias a poente. O 2442 e o 2403 confrontam os dois com o "Limite do Eirado" a poente.',
  'O 2449 era de António de Sousa, que é o vizinho sul do 2446. A zona sem registo encosta ao lado nordeste do 2449.',
  'Pela numeração da matriz, o 2446 e o 2448 ficam junto do 2444, 2449 e 2450, na área sem registo a nordeste. O 2403 e o 2437 ficam mais perto do 2402, 2404 e 2436, a sudoeste. Isso bate certo com o 2403 ter a poente o "Limite do Eirado".',
  'A soma das áreas da matriz é 4,97 ha (2403 + 2437 + 2446 + 2448). Compara este valor com as áreas sem registo calculadas no mapa.',
];
