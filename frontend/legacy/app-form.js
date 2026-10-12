// Cadastro de aplicação, usado pelas duas páginas (o + da galáxia e o do painel):
// validação espelhada da API, campos com sugestões de time e o combobox de órbitas.
// Script comum carregado depois de common.js. A página chama withAppForm(Component),
// põe appFormState(env) no state, espalha formVals() no renderVals e implementa
// onAppCreated(app, done) para colocar a app nova na lista dela. A edição (editApp)
// usa o mesmo formulário; a página que a oferece implementa onAppUpdated(app, done).

// O blur do campo de time espera o onMouseDown de uma sugestão antes de fechar a lista.
const TEAM_BLUR_MS = 150;
// Formulário de cadastro vazio, já no ambiente e nas órbitas indicados.
function emptyForm(env, orbits = []) {
  return { name: '', team: '', swaggerUrl: '', healthCheckUrl: '', env, orbits };
}
// Combobox de órbitas: a lista espera o onMouseDown de um item antes de fechar.
const ORBIT_BLUR_MS = 120;
// Validação do cadastro: as mesmas regras de api/src/validators/application.validator.js, que
// continua sendo a autoridade (um 400 dela também vira erro por campo).
const FIELD_LIMITS = { name: 60, team: 60, url: 2048, orbit: 40, orbits: 10 };
const TEAM_RE = /^[\p{L}\p{N} ._-]+$/u;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
function urlError(v, required) {
  if (!v) return required ? 'Informe a URL.' : '';
  if (v.length > FIELD_LIMITS.url) return `Use no máximo ${FIELD_LIMITS.url} caracteres.`;
  if (CONTROL_CHARS.test(v)) return 'A URL tem caracteres inválidos.';
  // O esquema é obrigatório: sem ele, "qualquer" viraria o host de uma URL válida.
  if (!/^https?:\/\//i.test(v)) return 'A URL deve começar com http:// ou https://';
  let u;
  try { u = new URL(v); } catch (e) { return 'URL inválida.'; }
  if (u.username || u.password) return 'Não inclua usuário ou senha na URL.';
  return '';
}
function textError(v, max, re, format) {
  if (!v) return 'Campo obrigatório.';
  if (v.length < 2 || v.length > max) return `Use de 2 a ${max} caracteres.`;
  if (CONTROL_CHARS.test(v) || !re.test(v)) return format;
  return '';
}
// Órbitas: de 1 a FIELD_LIMITS.orbits, cada uma com as regras do time. As
// repetidas (mesma orbitKey) já saem do form ao serem escolhidas.
function orbitsError(list) {
  if (!list.length) return 'Escolha ao menos uma órbita.';
  if (list.length > FIELD_LIMITS.orbits) return `Use no máximo ${FIELD_LIMITS.orbits} órbitas.`;
  const bad = list.find(o => o.length < 2 || o.length > FIELD_LIMITS.orbit || CONTROL_CHARS.test(o) || !TEAM_RE.test(o));
  return bad ? `Órbita "${bad}": use de 2 a ${FIELD_LIMITS.orbit} caracteres entre letras, números, espaços, ".", "_" ou "-".` : '';
}
// { value, errors }: value já normalizado (trim), errors
// só com os campos inválidos.
function validateAppForm(f) {
  const value = {
    name: f.name.trim(),
    team: f.team.trim(),
    healthCheckUrl: f.healthCheckUrl.trim(),
    swaggerUrl: f.swaggerUrl.trim(),
    orbits: f.orbits.map(o => o.trim())
  };
  const errors = {
    name: textError(value.name, FIELD_LIMITS.name, /^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Use letras sem acento, números, ".", "_" ou "-", começando por letra ou número.'),
    team: textError(value.team, FIELD_LIMITS.team, TEAM_RE, 'Use letras, números, espaços, ".", "_" ou "-".'),
    healthCheckUrl: urlError(value.healthCheckUrl, true),
    swaggerUrl: urlError(value.swaggerUrl, false),
    orbits: orbitsError(value.orbits)
  };
  Object.keys(errors).forEach(k => { if (!errors[k]) delete errors[k]; });
  return { value, errors };
}
function fieldStyle(err, mono) {
  return `padding:11px 13px; border-radius:var(--radius-md); border:1px solid ${err ? 'var(--down)' : 'var(--line)'}; background:var(--field); color:var(--ink); font-size:14px; outline:none${mono ? '; font-family:var(--mono)' : ''}`;
}
// Aba de ambiente (cadastro e cabeçalho do painel).
function envTab(active) {
  return `font-family:var(--mono); font-size:10px; letter-spacing:.14em; padding:7px 12px; border-radius:var(--radius-sm); cursor:pointer; border:1px solid ${active ? 'var(--accent)' : 'transparent'}; background:${active ? 'var(--accent-tint)' : 'transparent'}; color:${active ? 'var(--accent-soft)' : 'var(--muted)'}`;
}
function orbitDot(color) {
  return `width:8px; height:8px; border-radius:50%; flex:none; background:${color}`;
}
// O pedaço do state que o cadastro usa, para a página espalhar no seu.
function appFormState(env) {
  return {
    // editingId: id da app em edição; null é cadastro novo.
    formOpen: false, editingId: null, submitting: false, formError: '', formErrors: {}, form: emptyForm(env),
    teamDropOpen: false, orbitQuery: '', orbitListOpen: false, orbitHi: 0
  };
}

class AppFormMixin {
  // Cadastro novo: já na órbita do filtro, se houver.
  blankForm(env, apps = this.state.apps, orbit = this.state.orbit) {
    if (!orbit) return emptyForm(env);
    const known = collectOrbits(apps).find(o => o.key === orbit);
    return emptyForm(env, [known ? known.name : orbit]);
  }

  // Abre o formulário com os dados da app, para alterar só o que quiser. O ambiente
  // não muda: ele é a coleção onde a app está.
  editApp(app) {
    this.setState({
      formOpen: true, editingId: app.id, formError: '', formErrors: {}, orbitQuery: '', teamDropOpen: false, orbitListOpen: false,
      form: { name: app.name || '', team: app.team || '', swaggerUrl: app.swaggerUrl || '', healthCheckUrl: app.healthCheckUrl || '', env: app.env, orbits: [...(app.orbits || [])] }
    });
  }

  // Cadastro: POST na API; a lista só ganha a aplicação com o id devolvido.
  // Edição: PUT na API; a lista troca a app pela devolvida.
  async submitForm(e) {
    e.preventDefault();
    // Duplo clique / Enter repetido: um envio por vez.
    if (this.submitBusy) return;
    // Órbita digitada e não confirmada com Enter também entra.
    const f = this.withPendingOrbit();
    if (f !== this.state.form) this.setState({ form: f, orbitQuery: '' });
    const { value: payload, errors } = validateAppForm(f);
    if (Object.keys(errors).length) { this.setState({ formErrors: errors, formError: '' }); return; }
    const apiEnv = ENV_TO_API[f.env];
    const editingId = this.state.editingId;
    const verb = editingId ? 'salvar' : 'cadastrar';
    // Flag de instância: o setState não é síncrono e o segundo clique chegaria antes.
    this.submitBusy = true;
    this.setState({ submitting: true, formError: '', formErrors: {} });
    let created, failure = null;
    try {
      created = await apiFetch(editingId ? `/applications/${apiEnv}/${editingId}` : `/applications/${apiEnv}`, {
        method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) { failure = err; }
    finally { this.submitBusy = false; }
    if (failure) {
      // 400 com { fields }: a API recusou campos que passaram aqui; mostra no campo.
      const fields = failure.status === 400 && failure.body && failure.body.fields;
      if (fields && typeof fields === 'object') this.setState({ submitting: false, formErrors: fields, formError: 'A API recusou os dados: revise os campos marcados.' });
      // 404 na edição: a app foi removida (outra aba, outra pessoa).
      else if (editingId && failure.status === 404) this.setState({ submitting: false, formError: 'Esta aplicação não existe mais: ela foi removida. Feche o formulário.' });
      else this.setState({ submitting: false, formError: `Não foi possível ${verb}: ${apiErrorMsg(failure)}` });
      return;
    }
    // Sem id não há como listar (nem remover depois): trata como falha.
    if (!created || !created.id) { this.setState({ submitting: false, formError: `Não foi possível ${verb}: a API não devolveu o id da aplicação.` }); return; }
    const app = fromApi(created, apiEnv);
    if (editingId) {
      this.onAppUpdated(app, { submitting: false, formError: '', formErrors: {}, formOpen: false, editingId: null, form: this.blankForm(app.env), orbitQuery: '' });
      return;
    }
    // A página põe a app na lista dela; done fecha e limpa o cadastro no mesmo setState.
    // A app nova entra no próximo ciclo do servidor; não há check imediato.
    this.onAppCreated(app, { submitting: false, formError: '', formErrors: {}, formOpen: false, form: this.blankForm(app.env), orbitQuery: '' });
  }

  // Modal de cadastro.
  formVals() {
    const { form, formOpen, editingId, submitting, formError, formErrors } = this.state;
    const editing = !!editingId;
    const setF = k => e => this.setFormField(k, e.target.value);
    // Por campo: a mensagem, a flag do sc-if, o estilo do input e aria-invalid.
    // O template lê por caminho: {{ fields.name.err }}, {{ fields.team.style }}…
    const field = (k, mono) => {
      const err = formErrors[k] || '';
      return { err, has: !!err, style: fieldStyle(err, mono), invalid: err ? 'true' : 'false' };
    };
    return {
      formOpen,
      openForm: () => this.setState({ formOpen: true, formError: '', formErrors: {}, ...(this.state.form.name ? {} : { form: this.blankForm(this.state.form.env) }) }),
      // Fechar a edição descarta as alterações: o + abre de novo um cadastro em branco.
      closeForm: () => {
        if (this.state.submitting) return;
        this.setState({ formOpen: false, formError: '', formErrors: {}, ...(this.state.editingId ? { editingId: null, form: this.blankForm(this.state.form.env), orbitQuery: '' } : {}) });
      },
      formEyebrow: editing ? 'AJUSTE DE ROTA' : 'NOVO LANÇAMENTO',
      formTitle: editing ? 'Editar aplicação' : 'Adicionar aplicação',
      envLocked: editing,
      fields: { name: field('name'), team: field('team'), swaggerUrl: field('swaggerUrl', true), healthCheckUrl: field('healthCheckUrl', true), orbits: field('orbits') },
      nameMax: FIELD_LIMITS.name, teamMax: FIELD_LIMITS.team, urlMax: FIELD_LIMITS.url,
      fieldErrStyle: 'font-size:12px; line-height:1.4; color:var(--down)',
      submitting,
      hasFormError: !!formError,
      formError,
      submitLabel: editing ? (submitting ? 'Salvando…' : 'Salvar alterações') : (submitting ? 'Lançando…' : 'Lançar em órbita'),
      submitStyle: `flex:1.4; padding:12px; border-radius:var(--radius-md); border:1px solid var(--accent); background:var(--accent-tint); color:var(--accent-soft); font-size:14px; font-weight:500; cursor:${submitting ? 'wait' : 'pointer'}; opacity:${submitting ? .6 : 1}`,
      formName: form.name, formTeam: form.team, formSwaggerUrl: form.swaggerUrl, formHealthCheckUrl: form.healthCheckUrl,
      onName: setF('name'), onSwaggerUrl: setF('swaggerUrl'), onHealthCheckUrl: setF('healthCheckUrl'),
      // Na edição só aparece o ambiente da app, sem troca.
      formEnvs: ENVS.filter(({ code }) => !editing || code === form.env)
        .map(({ code, label }) => ({ label, style: envTab(form.env === code) + (editing ? '; cursor:default' : ''), onClick: () => { if (!this.state.editingId) this.setState({ form: { ...this.state.form, env: code } }); } })),
      submit: this.formHandlers().submit,
      ...this.teamVals(),
      ...this.orbitFieldVals()
    };
  }

  // Campo de time com sugestões tiradas das aplicações já cadastradas.
  teamVals() {
    const tq = (this.state.form.team || '').trim().toLowerCase();
    const allTeams = [...new Set(this.state.apps.map(a => a.team).filter(Boolean))].sort();
    const teamSuggestions = (tq ? allTeams.filter(t => t.toLowerCase().includes(tq)) : allTeams)
      .filter(t => t.toLowerCase() !== tq)
      .map(name => ({ name, select: () => this.setFormField('team', name, { teamDropOpen: false }) }));
    return {
      teamSuggestions,
      teamDropOpen: this.state.teamDropOpen && teamSuggestions.length > 0,
      onTeam: e => this.setFormField('team', e.target.value, { teamDropOpen: true }),
      onTeamFocus: () => this.setState({ teamDropOpen: true }),
      onTeamBlur: () => setTimeout(() => this.setState({ teamDropOpen: false }), TEAM_BLUR_MS)
    };
  }

  // Campo de órbitas: chips das escolhidas + busca nas órbitas de todas as apps,
  // com "Criar órbita" quando o texto não casa com nenhuma. Teclado: setas, Enter,
  // Esc fecha a lista e Backspace no campo vazio tira a última.
  orbitFieldVals() {
    const { form, orbitQuery, orbitListOpen, orbitHi, theme, formErrors } = this.state;
    const q = orbitQuery.trim();
    const qk = orbitKey(q);
    const chosen = new Set(form.orbits.map(orbitKey));
    const known = collectOrbits(this.state.apps);
    const items = known.filter(o => !qk || o.key.includes(qk))
      .map(o => ({ label: o.name, key: o.key, on: chosen.has(o.key), run: () => this.toggleOrbit(o.name) }));
    if (q && !known.some(o => o.key === qk) && !chosen.has(qk)) items.push({ label: `Criar órbita “${q}”`, key: qk, create: true, run: () => this.toggleOrbit(q) });
    const hi = Math.min(orbitHi, Math.max(0, items.length - 1));
    const colorOf = orbitColors(this.state.apps, theme);
    const err = formErrors.orbits || '';
    return {
      orbitChips: form.orbits.map(name => ({
        name,
        dot: orbitDot(colorOf(orbitKey(name))),
        remove: e => { e.stopPropagation(); this.toggleOrbit(name); }
      })),
      orbitItems: items.map((it, k) => ({
        label: it.label,
        hint: it.create ? 'ENTER' : it.on ? '✓' : '',
        dot: it.create ? 'width:8px; height:8px; border-radius:50%; flex:none; border:1px dashed var(--accent)' : orbitDot(colorOf(it.key)),
        style: `display:flex; align-items:center; gap:9px; width:100%; padding:8px 10px; border:none; border-radius:var(--radius-sm); cursor:pointer; font-size:13.5px; text-align:left; background:${k === hi ? 'var(--accent-tint)' : 'transparent'}; color:${it.create ? 'var(--accent-soft)' : it.on ? 'var(--ink)' : 'var(--muted)'}`,
        pick: e => { e.preventDefault(); it.run(); },
        hover: () => { if (k !== this.state.orbitHi) this.setState({ orbitHi: k }); }
      })),
      orbitListOpen,
      orbitListEmpty: items.length === 0,
      orbitQuery,
      orbitPlaceholder: form.orbits.length ? 'Adicionar outra…' : 'Buscar ou criar órbita',
      orbitMax: FIELD_LIMITS.orbit,
      orbitBoxStyle: `display:flex; flex-wrap:wrap; align-items:center; gap:6px; min-height:46px; padding:6px 8px; border-radius:var(--radius-md); background:var(--field); cursor:text; border:1px solid ${err ? 'var(--down)' : orbitListOpen ? 'var(--accent)' : 'var(--line)'}`,
      orbitInputRef: this.formHandlers().orbitInputRef,
      focusOrbitInput: () => { if (this.orbitInputEl) this.orbitInputEl.focus(); },
      onOrbitQuery: e => this.setState({ orbitQuery: e.target.value, orbitListOpen: true, orbitHi: 0 }),
      onOrbitFocus: () => this.setState({ orbitListOpen: true }),
      onOrbitBlur: () => setTimeout(() => this.setState({ orbitListOpen: false }), ORBIT_BLUR_MS),
      onOrbitKey: e => {
        const n = items.length;
        if (e.key === 'ArrowDown') { e.preventDefault(); this.setState({ orbitListOpen: true, orbitHi: n ? (hi + 1) % n : 0 }); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.setState({ orbitHi: n ? (hi - 1 + n) % n : 0 }); }
        else if (e.key === 'Enter') { e.preventDefault(); if (items[hi]) items[hi].run(); }
        else if (e.key === 'Escape') { if (orbitListOpen) { e.stopPropagation(); this.setState({ orbitListOpen: false }); } }
        else if (e.key === 'Backspace' && !orbitQuery && form.orbits.length) this.setFormField('orbits', form.orbits.slice(0, -1));
      }
    };
  }
  // Criados uma vez por instância: um ref novo a cada render faz o React chamá-lo de novo.
  formHandlers() {
    return this.formFns || (this.formFns = {
      submit: e => this.submitForm(e),
      orbitInputRef: el => { this.orbitInputEl = el; }
    });
  }
  // Liga/desliga a órbita no cadastro, pela chave: "financeiro" desliga "Financeiro".
  toggleOrbit(name) {
    const key = orbitKey(name);
    if (!key) return;
    const cur = this.state.form.orbits;
    const on = cur.some(o => orbitKey(o) === key);
    this.setFormField('orbits', on ? cur.filter(o => orbitKey(o) !== key) : [...cur, name.trim()], { orbitQuery: '', orbitHi: 0 });
  }
  // O form com a órbita ainda digitada no campo (sem Enter), se for nova; senão o mesmo objeto.
  withPendingOrbit() {
    const f = this.state.form;
    const q = this.state.orbitQuery.trim();
    if (!q || f.orbits.some(o => orbitKey(o) === orbitKey(q))) return f;
    const known = collectOrbits(this.state.apps).find(o => o.key === orbitKey(q));
    return { ...f, orbits: [...f.orbits, known ? known.name : q] };
  }

  // Mudar um campo do cadastro limpa o erro dele: a mensagem só volta no próximo
  // envio. extra vai no mesmo setState (ex.: abrir ou fechar as sugestões de time).
  setFormField(k, value, extra = {}) {
    this.setState({ form: { ...this.state.form, [k]: value }, formErrors: { ...this.state.formErrors, [k]: '' }, ...extra });
  }
}
// Copia os métodos do cadastro para a classe da página (que não pode herdar de
// duas classes: ela já estende o DCLogic do runtime).
function withAppForm(Cls) {
  Object.getOwnPropertyNames(AppFormMixin.prototype).forEach(k => {
    if (k !== 'constructor') Cls.prototype[k] = AppFormMixin.prototype[k];
  });
  return Cls;
}
