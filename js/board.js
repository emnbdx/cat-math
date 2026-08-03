/**
 * Le plateau de 100 : 10 colonnes (unités) × 10 lignes (dizaines).
 *
 * La taille de police est en unités `cqw` (relatives à la largeur du plateau),
 * donc les 100 nombres restent lisibles du téléphone au grand écran sans
 * media queries.
 */

export function makeBoard(host, { interactive = false, onPick = null } = {}) {
  const board = document.createElement('div');
  board.className = 'board';
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', 'Table de 100');

  const cells = new Map();

  for (let n = 1; n <= 100; n++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    // Une colonne sur deux légèrement teintée : repère pour retrouver l'unité.
    if ((n - 1) % 2 === 1) cell.classList.add('is-odd-col');
    cell.dataset.n = String(n);
    cell.setAttribute('role', 'gridcell');
    if (!interactive) cell.disabled = true;
    cells.set(n, cell);
    board.append(cell);
  }

  if (interactive && onPick) {
    board.addEventListener('click', (event) => {
      const cell = event.target.closest('.cell');
      if (!cell || cell.disabled) return;
      onPick(Number(cell.dataset.n), cell);
    });
  }

  host.replaceChildren(board);

  return {
    el: board,
    cell: (n) => cells.get(n),
    cells: () => cells.values(),

    /** Case vide (petit point gris), éventuellement avec le nombre en filigrane. */
    empty(n, ghost = false) {
      const cell = cells.get(n);
      cell.className = baseClass(n) + (ghost ? ' cell--ghost' : ' cell--empty');
      cell.textContent = ghost ? String(n) : '';
      cell.disabled = false;
      cell.setAttribute('aria-label', `case ${n}, vide`);
    },

    /** Case remplie par l'enfant. */
    fill(n) {
      const cell = cells.get(n);
      cell.className = baseClass(n) + ' cell--filled';
      cell.textContent = String(n);
      cell.disabled = true;
      cell.setAttribute('aria-label', `${n}, bien placé`);
    },

    /** Case affichant simplement son nombre (mode voix). */
    show(n, extra = '') {
      const cell = cells.get(n);
      cell.className = baseClass(n) + (extra ? ` ${extra}` : '');
      cell.textContent = String(n);
      cell.setAttribute('aria-label', String(n));
    },

    /** Ajoute une classe le temps d'une animation. */
    flash(n, cls, ms = 500) {
      const cell = cells.get(n);
      if (!cell) return;
      cell.classList.remove(cls);
      // reflow pour rejouer l'animation même si la classe vient d'être retirée
      void cell.offsetWidth;
      cell.classList.add(cls);
      setTimeout(() => cell.classList.remove(cls), ms);
    },
  };
}

function baseClass(n) {
  return `cell${(n - 1) % 2 === 1 ? ' is-odd-col' : ''}`;
}
