// Dobra acentos para busca: "Cérebro" → "cerebro", "ação" → "acao".
// PRECISA ser aplicada tanto na indexação quanto na consulta (processTerm
// no construtor E em searchOptions) — dobrar só um lado faz "cerebro"
// deixar de encontrar "cérebro" silenciosamente, sem erro nenhum.
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
