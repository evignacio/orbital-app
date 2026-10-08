const events = require("../src/services/events.service");

const fakeRes = () => ({ write: jest.fn(), end: jest.fn() });

const status = { id: "a1", name: "billing", env: "production", status: "healthy" };

let subscriptions;
const subscribe = (res, opts) => {
  const subscription = events.subscribe(res, opts);
  subscriptions.push(subscription);
  return subscription;
};

beforeEach(() => {
  subscriptions = [];
});

afterEach(() => {
  subscriptions.forEach(subscription => subscription.unsubscribe());
});

describe("send", () => {
  it("escreve a mensagem SSE no formato exato event/data com linha em branco no fim", () => {
    const res = fakeRes();

    events.send(res, "status", status);

    expect(res.write).toHaveBeenCalledWith(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
  });

  it("mantém o data em uma única linha mesmo com quebras de linha nos valores", () => {
    const res = fakeRes();

    events.send(res, "status", { name: "a\nb" });

    expect(res.write).toHaveBeenCalledWith('event: status\ndata: {"name":"a\\nb"}\n\n');
  });
});

describe("publish", () => {
  it("entrega o evento status a todos os assinantes", () => {
    const a = fakeRes();
    const b = fakeRes();
    subscribe(a, { changesOnly: false });
    subscribe(b, { changesOnly: true });

    events.publish({ type: "status", changed: true, data: status });

    expect(a.write).toHaveBeenCalledWith(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
    expect(b.write).toHaveBeenCalledWith(`event: status\ndata: ${JSON.stringify(status)}\n\n`);
  });

  it("status sem mudança não chega a quem só quer mudanças, mas chega aos demais", () => {
    const all = fakeRes();
    const changesOnly = fakeRes();
    subscribe(all, { changesOnly: false });
    subscribe(changesOnly, { changesOnly: true });

    events.publish({ type: "status", changed: false, data: status });

    expect(all.write).toHaveBeenCalledTimes(1);
    expect(changesOnly.write).not.toHaveBeenCalled();
  });

  it("o evento cycle chega a todos, inclusive a quem só quer mudanças", () => {
    const all = fakeRes();
    const changesOnly = fakeRes();
    subscribe(all, { changesOnly: false });
    subscribe(changesOnly, { changesOnly: true });
    const cycle = { env: "production", checked: 4, changed: 0 };

    events.publish({ type: "cycle", data: cycle });

    expect(all.write).toHaveBeenCalledWith(`event: cycle\ndata: ${JSON.stringify(cycle)}\n\n`);
    expect(changesOnly.write).toHaveBeenCalledWith(`event: cycle\ndata: ${JSON.stringify(cycle)}\n\n`);
  });

  it("uma conexão que falha ao escrever não impede a entrega aos outros assinantes", () => {
    const broken = fakeRes();
    broken.write.mockImplementation(() => {
      throw new Error("write after end");
    });
    const healthy = fakeRes();
    subscribe(broken);
    subscribe(healthy);

    expect(() => events.publish({ type: "status", changed: true, data: status })).not.toThrow();

    expect(healthy.write).toHaveBeenCalledTimes(1);
  });
});

describe("subscribe", () => {
  it("o unsubscribe devolvido interrompe a entrega e atualiza a contagem de clientes", () => {
    const res = fakeRes();
    const { unsubscribe } = subscribe(res);
    expect(events.clientCount()).toBe(1);

    unsubscribe();

    expect(events.clientCount()).toBe(0);
    events.publish({ type: "cycle", data: {} });
    expect(res.write).not.toHaveBeenCalled();
  });
});

describe("subscribe com hold", () => {
  it("enfileira o que é publicado até o release e entrega na ordem", () => {
    const res = fakeRes();
    const { release } = subscribe(res, { hold: true });

    events.publish({ type: "status", changed: true, data: status });
    events.publish({ type: "cycle", data: { env: "production" } });
    expect(res.write).not.toHaveBeenCalled();

    release();

    expect(res.write.mock.calls.map(([text]) => text.split("\n")[0])).toEqual(["event: status", "event: cycle"]);
  });

  it("depois do release entrega na hora, e um segundo release não repete nada", () => {
    const res = fakeRes();
    const { release } = subscribe(res, { hold: true });
    release();

    events.publish({ type: "cycle", data: {} });
    release();

    expect(res.write).toHaveBeenCalledTimes(1);
  });

  it("aplica o filtro changesOnly também ao que fica na fila", () => {
    const res = fakeRes();
    const { release } = subscribe(res, { changesOnly: true, hold: true });

    events.publish({ type: "status", changed: false, data: status });
    release();

    expect(res.write).not.toHaveBeenCalled();
  });

  it("o release de uma assinatura só afeta a própria conexão", () => {
    const a = fakeRes();
    const b = fakeRes();
    const subscriptionA = subscribe(a, { hold: true });
    subscribe(b, { hold: true });
    events.publish({ type: "cycle", data: {} });

    subscriptionA.release();

    expect(a.write).toHaveBeenCalledTimes(1);
    expect(b.write).not.toHaveBeenCalled();
  });

  it("unsubscribe descarta a fila", () => {
    const res = fakeRes();
    const { release, unsubscribe } = subscribe(res, { hold: true });
    events.publish({ type: "cycle", data: {} });

    unsubscribe();
    release();

    expect(res.write).not.toHaveBeenCalled();
  });
});

describe("closeAll", () => {
  it("encerra a resposta de todos os assinantes e esvazia a lista", () => {
    const a = fakeRes();
    const b = fakeRes();
    subscribe(a);
    subscribe(b);

    events.closeAll();

    expect(a.end).toHaveBeenCalledTimes(1);
    expect(b.end).toHaveBeenCalledTimes(1);
    expect(events.clientCount()).toBe(0);
  });
});
