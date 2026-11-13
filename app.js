(() => {
  'use strict';

  const STORAGE_KEY = 'mibalance_transactions_v1';
  const SETTINGS_KEY = 'mibalance_settings_v1';
  const TRANSACTION_NATURES = [
    'Gasto fijo',
    'Variable',
    'Deuda / Tarjeta',
    'Ahorro',
    'Ingreso quincenal',
    'Otro'
  ];
  const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const currencyFormatter = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Referencias DOM
  const totalBalanceEl = document.getElementById('total-balance');
  const balanceCardEl = document.getElementById('balance-card');
  const balanceStatusEl = document.getElementById('balance-status');
  const totalIncomeEl = document.getElementById('total-income');
  const totalExpenseEl = document.getElementById('total-expense');
  const stopLossBtn = document.getElementById('stop-loss-btn');
  const spendableBalanceEl = document.getElementById('spendable-balance');

  const formEl = document.getElementById('transaction-form');
  const formTitleEl = document.getElementById('form-title');
  const editIdInput = document.getElementById('edit-id');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const typeExpenseRadio = document.getElementById('type-expense');
  const typeIncomeRadio = document.getElementById('type-income');
  const descriptionInput = document.getElementById('description');
  const amountInput = document.getElementById('amount');
  const categorySelect = document.getElementById('category');
  const dateInput = document.getElementById('date');
  const natureSelect = document.getElementById('transaction-nature');
  const payPeriodBadgeEl = document.getElementById('pay-period-badge');
  const formErrorEl = document.getElementById('form-error');
  const submitBtn = document.getElementById('submit-btn');

  const transactionListEl = document.getElementById('transaction-list');
  const emptyStateEl = document.getElementById('empty-state');
  const movementsCountEl = document.getElementById('movements-count');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const periodFilterEl = document.getElementById('period-filter');

  const exportBtn = document.getElementById('export-btn');
  const importBtn = document.getElementById('import-btn');
  const importFileInput = document.getElementById('import-file');
  const resetBtn = document.getElementById('reset-btn');

  const modalBackdropEl = document.getElementById('modal-backdrop');
  const modalTitleEl = document.getElementById('modal-title');
  const modalMessageEl = document.getElementById('modal-message');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');
  const modalInputContainerEl = document.getElementById('modal-input-container');
  const stopLossInputEl = document.getElementById('modal-stop-loss-input');
  const toastEl = document.getElementById('toast');

  // Calculadora rápida
  const toggleCalcBtn = document.getElementById('toggle-calc-btn');
  const closeCalcBtn = document.getElementById('close-calc-btn');
  const calcPanelEl = document.getElementById('calculator-panel');
  const calcExpressionEl = document.getElementById('calc-expression');
  const calcDisplayValueEl = document.getElementById('calc-display-value');
  const calcKeysEl = document.getElementById('calc-keys');

  let transactions = loadTransactions();
  let settings = loadSettings();
  let currentFilter = 'all';
  let currentPeriodFilter = 'all';
  let toastTimeoutId = null;
  let resetStep = 0;
  let modalMode = '';
  let pendingTransaction = null;
  let pendingEditingId = '';

  let calcExpression = '';
  let calcLastResult = '0';

  function getTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatMoney(value) {
    const formatted = currencyFormatter.format(Math.abs(value));
    return value < 0 ? `-${formatted}` : formatted;
  }

  function formatDateDisplay(isoDate) {
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) return isoDate;
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return dateObj.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function getPayPeriodInfo(isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate));
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12) return null;

    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (day < 1 || day > daysInMonth) return null;

    const isFirstHalf = day <= 15;
    return {
      key: `${match[1]}-${match[2]}-${isFirstHalf ? 'Q1' : 'Q2'}`,
      label: `${isFirstHalf ? '15' : daysInMonth}-${MONTH_NAMES[month - 1]}`
    };
  }

  function updatePayPeriodBadge() {
    const period = getPayPeriodInfo(dateInput.value);
    payPeriodBadgeEl.textContent = period ? `Quincena: ${period.label}` : 'Quincena: —';
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function loadTransactions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isValidTransaction) : [];
    } catch {
      return [];
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        const defaults = { stopLoss: 0 };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaults));
        return defaults;
      }
      const parsed = JSON.parse(raw);
      const stopLoss = parsed && parsed.stopLoss;
      return { stopLoss: Number.isFinite(stopLoss) && stopLoss > 0 ? Math.round(stopLoss * 100) / 100 : 0 };
    } catch {
      return { stopLoss: 0 };
    }
  }

  function saveTransactions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function isValidDateISO(value) {
    return getPayPeriodInfo(value) !== null;
  }

  function isValidTransaction(item) {
    return (
      item &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.description === 'string' &&
      item.description.trim().length > 0 &&
      typeof item.amount === 'number' &&
      Number.isFinite(item.amount) &&
      item.amount > 0 &&
      (item.type === 'income' || item.type === 'expense') &&
      typeof item.category === 'string' &&
      typeof item.date === 'string' &&
      isValidDateISO(item.date)
    );
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, 2800);
  }

  function showFormError(message) {
    formErrorEl.textContent = message;
    formErrorEl.classList.remove('hidden');
  }

  function clearFormError() {
    formErrorEl.textContent = '';
    formErrorEl.classList.add('hidden');
  }

  function updateDashboard() {
    let totalIncome = 0;
    let totalExpense = 0;

    for (const tx of transactions) {
      if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
      }
    }

    const balance = Math.round((totalIncome - totalExpense) * 100) / 100;

    totalIncomeEl.textContent = formatMoney(totalIncome);
    totalExpenseEl.textContent = formatMoney(totalExpense);
    totalBalanceEl.textContent = formatMoney(balance);

    balanceCardEl.classList.remove('is-positive', 'is-negative');
    if (balance >= 0) {
      balanceCardEl.classList.add('is-positive');
      balanceStatusEl.textContent = balance === 0 ? 'Equilibrado' : 'Positivo';
    } else {
      balanceCardEl.classList.add('is-negative');
      balanceStatusEl.textContent = 'En contra';
    }

    stopLossBtn.textContent = settings.stopLoss > 0
      ? `Stop Loss: ${formatMoney(settings.stopLoss)}`
      : 'Configurar Stop Loss';
    spendableBalanceEl.classList.toggle('hidden', settings.stopLoss <= 0);
    spendableBalanceEl.classList.toggle('is-warning', balance <= settings.stopLoss);
    if (settings.stopLoss > 0) {
      spendableBalanceEl.textContent = `Disponible para gastar: ${formatMoney(balance - settings.stopLoss)}`;
    }
  }

  function renderPeriodFilter() {
    const currentPeriod = getPayPeriodInfo(getTodayISO());
    const periods = new Map();
    for (const tx of transactions) {
      const period = getPayPeriodInfo(tx.date);
      if (period) periods.set(period.key, period);
    }

    periodFilterEl.replaceChildren();
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Todas las quincenas';
    periodFilterEl.appendChild(allOption);

    if (currentPeriod) {
      periods.set(currentPeriod.key, currentPeriod);
      const currentOption = document.createElement('option');
      currentOption.value = currentPeriod.key;
      currentOption.textContent = `Quincena actual (${currentPeriod.label})`;
      periodFilterEl.appendChild(currentOption);
    }

    Array.from(periods.entries())
      .filter(([key]) => !currentPeriod || key !== currentPeriod.key)
      .sort(([keyA], [keyB]) => keyB.localeCompare(keyA))
      .forEach(([key, period]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = period.label;
        periodFilterEl.appendChild(option);
      });

    const hasSelectedPeriod = Array.from(periodFilterEl.options)
      .some((option) => option.value === currentPeriodFilter);
    if (!hasSelectedPeriod) currentPeriodFilter = 'all';
    periodFilterEl.value = currentPeriodFilter;
  }

  function getSortedFilteredTransactions() {
    return transactions
      .filter((tx) => (currentFilter === 'all' || tx.type === currentFilter) &&
        (currentPeriodFilter === 'all' || getPayPeriodInfo(tx.date).key === currentPeriodFilter))
      .slice()
      .sort((a, b) => {
        if (b.date !== a.date) {
          return b.date.localeCompare(a.date);
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }

  function createActionIcon(pathD) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  function renderList() {
    const items = getSortedFilteredTransactions();
    movementsCountEl.textContent = String(items.length);
    transactionListEl.innerHTML = '';

    if (items.length === 0) {
      emptyStateEl.classList.remove('hidden');
      return;
    }

    emptyStateEl.classList.add('hidden');
    const fragment = document.createDocumentFragment();

    for (const tx of items) {
      const li = document.createElement('li');
      li.className = 'transaction-item';

      const mainDiv = document.createElement('div');
      mainDiv.className = 'tx-main';

      const titleP = document.createElement('p');
      titleP.className = 'tx-title';
      titleP.textContent = tx.description;

      const metaDiv = document.createElement('div');
      metaDiv.className = 'tx-meta';

      const catSpan = document.createElement('span');
      catSpan.className = 'tx-category';
      catSpan.textContent = tx.category;

      const dateSpan = document.createElement('span');
      dateSpan.textContent = formatDateDisplay(tx.date);

      const periodSpan = document.createElement('span');
      periodSpan.className = 'tx-period';
      periodSpan.textContent = getPayPeriodInfo(tx.date).label;

      const natureSpan = document.createElement('span');
      natureSpan.className = 'tx-nature';
      natureSpan.textContent = TRANSACTION_NATURES.includes(tx.nature) ? tx.nature : 'Otro';

      metaDiv.append(catSpan, dateSpan, periodSpan, natureSpan);
      if (tx.emergencyOverride === true) {
        const emergencySpan = document.createElement('span');
        emergencySpan.className = 'tx-emergency';
        emergencySpan.textContent = 'Emergencia';
        metaDiv.appendChild(emergencySpan);
      }
      mainDiv.append(titleP, metaDiv);

      const rightDiv = document.createElement('div');
      rightDiv.className = 'tx-right';

      const amountSpan = document.createElement('span');
      amountSpan.className = `tx-amount ${tx.type}`;
      const sign = tx.type === 'income' ? '+' : '-';
      amountSpan.textContent = `${sign}${formatMoney(tx.amount)}`;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'tx-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'tx-action-btn edit';
      editBtn.title = 'Editar movimiento';
      editBtn.setAttribute('aria-label', `Editar ${tx.description}`);
      editBtn.appendChild(createActionIcon('M12 20h9M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z'));
      editBtn.addEventListener('click', () => startEditTransaction(tx.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'tx-action-btn delete';
      deleteBtn.title = 'Eliminar movimiento';
      deleteBtn.setAttribute('aria-label', `Eliminar ${tx.description}`);
      deleteBtn.appendChild(createActionIcon('M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6'));
      deleteBtn.addEventListener('click', () => deleteTransaction(tx.id));

      actionsDiv.append(editBtn, deleteBtn);
      rightDiv.append(amountSpan, actionsDiv);
      li.append(mainDiv, rightDiv);
      fragment.appendChild(li);
    }

    transactionListEl.appendChild(fragment);
  }

  function renderAll() {
    updateDashboard();
    renderPeriodFilter();
    renderList();
  }

  function resetForm() {
    editIdInput.value = '';
    formEl.reset();
    typeExpenseRadio.checked = true;
    dateInput.value = getTodayISO();
    natureSelect.value = 'Otro';
    updatePayPeriodBadge();
    formTitleEl.textContent = 'Nuevo movimiento';
    submitBtn.textContent = 'Agregar movimiento';
    cancelEditBtn.classList.add('hidden');
    clearFormError();
  }

  function startEditTransaction(id) {
    const tx = transactions.find((item) => item.id === id);
    if (!tx) return;

    editIdInput.value = tx.id;
    descriptionInput.value = tx.description;
    amountInput.value = tx.amount.toFixed(2);
    categorySelect.value = tx.category;
    dateInput.value = tx.date;
    natureSelect.value = TRANSACTION_NATURES.includes(tx.nature) ? tx.nature : 'Otro';
    updatePayPeriodBadge();

    if (tx.type === 'income') {
      typeIncomeRadio.checked = true;
    } else {
      typeExpenseRadio.checked = true;
    }

    formTitleEl.textContent = 'Editar movimiento';
    submitBtn.textContent = 'Guardar cambios';
    cancelEditBtn.classList.remove('hidden');
    clearFormError();
    formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    descriptionInput.focus();
  }

  function deleteTransaction(id) {
    transactions = transactions.filter((tx) => tx.id !== id);
    if (editIdInput.value === id) {
      resetForm();
    }
    saveTransactions();
    renderAll();
    showToast('Movimiento eliminado');
  }

  function getBalance() {
    const balance = transactions.reduce((total, tx) =>
      total + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
    return Math.round(balance * 100) / 100;
  }

  function saveTransaction(transaction, editingId) {
    if (editingId) {
      const index = transactions.findIndex((tx) => tx.id === editingId);
      if (index === -1) {
        closeModal();
        showFormError('No se encontró el movimiento que intentas editar.');
        return;
      }
      transactions[index] = transaction;
      showToast('Movimiento actualizado');
    } else {
      transactions.push(transaction);
      showToast('Movimiento agregado');
    }

    saveTransactions();
    renderAll();
    resetForm();
    closeModal();
  }

  function getProjectedBalance(transaction, editingId) {
    const oldTransaction = editingId ? transactions.find((tx) => tx.id === editingId) : null;
    const currentBalance = getBalance();
    const oldContribution = oldTransaction
      ? (oldTransaction.type === 'income' ? oldTransaction.amount : -oldTransaction.amount)
      : 0;
    const newContribution = transaction.type === 'income' ? transaction.amount : -transaction.amount;
    return {
      currentBalance,
      projectedBalance: Math.round((currentBalance - oldContribution + newContribution) * 100) / 100,
      balanceWithoutEditedTransaction: currentBalance - oldContribution
    };
  }

  function submitTransaction() {
    clearFormError();
    const description = descriptionInput.value.trim();
    const rawAmount = parseFloat(amountInput.value);
    const amount = Math.round(rawAmount * 100) / 100;
    const type = typeIncomeRadio.checked ? 'income' : 'expense';
    const category = categorySelect.value;
    const date = dateInput.value || getTodayISO();
    const editingId = editIdInput.value;

    if (!description) {
      showFormError('Ingresa una descripción para el movimiento.');
      descriptionInput.focus();
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showFormError('Ingresa un monto numérico mayor a 0.');
      amountInput.focus();
      return;
    }

    if (!isValidDateISO(date)) {
      showFormError('Selecciona una fecha válida.');
      dateInput.focus();
      return;
    }

    const existing = editingId ? transactions.find((tx) => tx.id === editingId) : null;
    const transaction = {
      ...(existing || {}),
      id: existing ? existing.id : generateId(),
      description,
      amount,
      type,
      category,
      date,
      nature: TRANSACTION_NATURES.includes(natureSelect.value) ? natureSelect.value : 'Otro',
      createdAt: existing && typeof existing.createdAt === 'number' ? existing.createdAt : Date.now()
    };

    if (type === 'expense' && settings.stopLoss > 0) {
      const { currentBalance, projectedBalance, balanceWithoutEditedTransaction } =
        getProjectedBalance(transaction, editingId);
      if (projectedBalance < settings.stopLoss && projectedBalance < currentBalance) {
        const maximumSpend = Math.max(0, Math.round((balanceWithoutEditedTransaction - settings.stopLoss) * 100) / 100);
        pendingTransaction = transaction;
        pendingEditingId = editingId;
        modalMode = 'stop-loss-warning';
        openModal(
          'Stop Loss alcanzado',
          `El balance proyectado sería ${formatMoney(projectedBalance)}. El límite protegido es ${formatMoney(settings.stopLoss)}. Puedes gastar hasta ${formatMoney(maximumSpend)} sin romper el Stop Loss.`,
          'Desbloqueo de emergencia'
        );
        modalCancelBtn.textContent = 'Cancelar';
        modalConfirmBtn.classList.remove('btn-secondary');
        modalConfirmBtn.classList.add('btn-danger');
        return;
      }
    }

    saveTransaction(transaction, editingId);
  }

  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    submitTransaction();
  });

  dateInput.addEventListener('input', updatePayPeriodBadge);
  dateInput.addEventListener('change', updatePayPeriodBadge);

  cancelEditBtn.addEventListener('click', () => {
    resetForm();
  });

  // Filtros
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      filterBtns.forEach((b) => {
        const isActive = b === btn;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-selected', String(isActive));
      });
      renderList();
    });
  });

  periodFilterEl.addEventListener('change', () => {
    currentPeriodFilter = periodFilterEl.value;
    renderList();
  });

  // Exportar JSON
  exportBtn.addEventListener('click', () => {
    const payload = {
      app: 'MiBalance',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      transactions
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mibalance-respaldo-${getTodayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Respaldo JSON descargado');
  });

  // Importar JSON
  importBtn.addEventListener('click', () => {
    importFileInput.value = '';
    importFileInput.click();
  });

  importFileInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : parsed.transactions;

      if (!Array.isArray(list)) {
        throw new Error('Formato inválido');
      }

      const validItems = list.filter(isValidTransaction).map((item) => ({
        id: item.id,
        description: item.description.trim(),
        amount: Math.round(item.amount * 100) / 100,
        type: item.type,
        category: item.category,
        date: item.date,
        nature: TRANSACTION_NATURES.includes(item.nature) ? item.nature : 'Otro',
        ...(item.emergencyOverride === true ? { emergencyOverride: true } : {}),
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
      }));

      if (list.length > 0 && validItems.length === 0) {
        throw new Error('Sin registros válidos');
      }

      let importedStopLoss = 0;
      if (!Array.isArray(parsed) && parsed.settings !== undefined) {
        const stopLoss = parsed.settings && parsed.settings.stopLoss;
        if (!Number.isFinite(stopLoss) || stopLoss < 0) {
          throw new Error('Configuración inválida');
        }
        importedStopLoss = Math.round(stopLoss * 100) / 100;
      }

      transactions = validItems;
      settings = { stopLoss: importedStopLoss };
      saveTransactions();
      saveSettings();
      resetForm();
      renderAll();
      showToast(`Se restauraron ${validItems.length} movimientos`);
    } catch {
      showToast('Archivo JSON inválido o dañado');
    }
  });

  // Doble confirmación para reiniciar / borrar todo
  function openModal(title, message, confirmLabel) {
    modalTitleEl.textContent = title;
    modalMessageEl.textContent = message;
    modalConfirmBtn.textContent = confirmLabel;
    modalInputContainerEl.classList.add('hidden');
    modalBackdropEl.classList.remove('hidden');
  }

  function closeModal() {
    modalBackdropEl.classList.add('hidden');
    modalInputContainerEl.classList.add('hidden');
    resetStep = 0;
    modalMode = '';
    pendingTransaction = null;
    pendingEditingId = '';
    modalCancelBtn.textContent = 'Cancelar';
    modalConfirmBtn.classList.remove('btn-secondary');
    modalConfirmBtn.classList.add('btn-danger');
  }

  stopLossBtn.addEventListener('click', () => {
    modalMode = 'settings';
    openModal('Configurar Stop Loss', 'Define el saldo mínimo que quieres proteger.', 'Guardar límite');
    modalInputContainerEl.classList.remove('hidden');
    stopLossInputEl.value = settings.stopLoss > 0 ? settings.stopLoss.toFixed(2) : '0';
    modalConfirmBtn.classList.remove('btn-danger');
    modalConfirmBtn.classList.add('btn-secondary');
    stopLossInputEl.focus();
  });

  resetBtn.addEventListener('click', () => {
    if (transactions.length === 0) {
      showToast('No hay datos para borrar');
      return;
    }
    resetStep = 1;
    modalMode = 'reset';
    openModal(
      'Reiniciar mes / Borrar todo (1/2)',
      `Tienes ${transactions.length} movimientos guardados. ¿Deseas eliminar todos los registros de este dispositivo?`,
      'Sí, continuar'
    );
  });

  modalConfirmBtn.addEventListener('click', () => {
    if (modalMode === 'settings') {
      if (stopLossInputEl.value.trim() === '') {
        modalMessageEl.textContent = 'Ingresa un monto válido mayor o igual a 0.';
        stopLossInputEl.focus();
        return;
      }
      const stopLoss = Number(stopLossInputEl.value);
      if (!Number.isFinite(stopLoss) || stopLoss < 0) {
        modalMessageEl.textContent = 'Ingresa un monto válido mayor o igual a 0.';
        stopLossInputEl.focus();
        return;
      }
      settings = { stopLoss: Math.round(stopLoss * 100) / 100 };
      saveSettings();
      closeModal();
      renderAll();
      showToast(settings.stopLoss > 0 ? 'Stop Loss actualizado' : 'Stop Loss desactivado');
      return;
    }

    if (modalMode === 'stop-loss-warning') {
      modalMode = 'emergency-confirm';
      openModal(
        'Confirmar desbloqueo de emergencia',
        'Este gasto dejará el balance por debajo del saldo mínimo protegido. ¿Confirmas explícitamente que deseas guardarlo?',
        'Sí, guardar gasto'
      );
      modalCancelBtn.textContent = 'No, cancelar';
      return;
    }

    if (modalMode === 'emergency-confirm') {
      if (pendingTransaction) {
        pendingTransaction.emergencyOverride = true;
        saveTransaction(pendingTransaction, pendingEditingId);
      }
      return;
    }

    if (modalMode === 'reset' && resetStep === 1) {
      resetStep = 2;
      openModal(
        'Confirmación definitiva (2/2)',
        'Esta acción no se puede deshacer si no exportaste un respaldo JSON. ¿Confirmas borrar todo?',
        'Borrar todo ahora'
      );
      return;
    }

    if (modalMode === 'reset' && resetStep === 2) {
      transactions = [];
      localStorage.removeItem(STORAGE_KEY);
      resetForm();
      renderAll();
      closeModal();
      showToast('Todos los movimientos fueron borrados');
    }
  });

  modalCancelBtn.addEventListener('click', closeModal);
  modalBackdropEl.addEventListener('click', (event) => {
    if (event.target === modalBackdropEl) {
      closeModal();
    }
  });

  // Calculadora rápida segura (sin eval)
  function evaluateMathExpression(expr) {
    const tokens = expr.match(/(\d+(?:\.\d+)?|[+\-*/])/g);
    if (!tokens || tokens.length === 0) return null;

    const values = [];
    const ops = [];
    const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };

    function applyOp() {
      if (values.length < 2 || ops.length < 1) return false;
      const b = values.pop();
      const a = values.pop();
      const op = ops.pop();
      if (op === '+') values.push(a + b);
      else if (op === '-') values.push(a - b);
      else if (op === '*') values.push(a * b);
      else if (op === '/') {
        if (b === 0) return false;
        values.push(a / b);
      }
      return true;
    }

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!Number.isNaN(Number(token))) {
        values.push(parseFloat(token));
      } else {
        if (i === 0 && token === '-') {
          values.push(0);
        }
        while (ops.length > 0 && precedence[ops[ops.length - 1]] >= precedence[token]) {
          if (!applyOp()) return null;
        }
        ops.push(token);
      }
    }

    while (ops.length > 0) {
      if (!applyOp()) return null;
    }

    if (values.length !== 1 || !Number.isFinite(values[0])) return null;
    return Math.round(values[0] * 100) / 100;
  }

  function updateCalculatorUI() {
    calcExpressionEl.textContent = calcExpression.replace(/\*/g, '×').replace(/\//g, '÷') || '\u00A0';
    calcDisplayValueEl.textContent = calcLastResult;
  }

  function toggleCalculator(forceState) {
    const shouldShow = typeof forceState === 'boolean' ? forceState : calcPanelEl.classList.contains('hidden');
    calcPanelEl.classList.toggle('hidden', !shouldShow);
    toggleCalcBtn.setAttribute('aria-expanded', String(shouldShow));
  }

  toggleCalcBtn.addEventListener('click', () => toggleCalculator());
  closeCalcBtn.addEventListener('click', () => toggleCalculator(false));

  calcKeysEl.addEventListener('click', (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;

    const action = btn.dataset.action;
    const value = btn.dataset.value;

    if (action === 'clear') {
      calcExpression = '';
      calcLastResult = '0';
      updateCalculatorUI();
      return;
    }

    if (action === 'backspace') {
      calcExpression = calcExpression.slice(0, -1);
      const preview = evaluateMathExpression(calcExpression.replace(/[+\-*/.]$/, ''));
      calcLastResult = preview !== null ? String(preview) : '0';
      updateCalculatorUI();
      return;
    }

    if (action === 'equals') {
      const cleanExpr = calcExpression.replace(/[+\-*/.]$/, '');
      const result = evaluateMathExpression(cleanExpr);
      if (result === null) {
        calcLastResult = 'Error';
      } else {
        calcLastResult = String(result);
        calcExpression = String(result);
      }
      updateCalculatorUI();
      return;
    }

    if (action === 'use') {
      const cleanExpr = calcExpression.replace(/[+\-*/.]$/, '');
      const computed = cleanExpr ? evaluateMathExpression(cleanExpr) : parseFloat(calcLastResult);
      if (computed !== null && Number.isFinite(computed) && computed > 0) {
        amountInput.value = computed.toFixed(2);
        toggleCalculator(false);
        amountInput.focus();
        showToast(`Monto aplicado: ${formatMoney(computed)}`);
      } else {
        showToast('Calcula un monto mayor a 0');
      }
      return;
    }

    if (value) {
      const isOp = ['+', '-', '*', '/'].includes(value);
      const lastChar = calcExpression.slice(-1);

      if (isOp) {
        if (!calcExpression && value !== '-') return;
        if (['+', '-', '*', '/'].includes(lastChar)) {
          calcExpression = calcExpression.slice(0, -1) + value;
        } else {
          calcExpression += value;
        }
      } else if (value === '.') {
        const lastNumber = calcExpression.split(/[+\-*/]/).pop();
        if (lastNumber.includes('.')) return;
        calcExpression += lastNumber === '' ? '0.' : '.';
      } else {
        calcExpression += value;
      }

      const preview = evaluateMathExpression(calcExpression.replace(/[+\-*/.]$/, ''));
      if (preview !== null) {
        calcLastResult = String(preview);
      }
      updateCalculatorUI();
    }
  });

  // Inicialización
  dateInput.value = getTodayISO();
  renderAll();

  // Registro de Service Worker para PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
