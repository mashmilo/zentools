// Every tool is one file: register it with its slug and mount into `root`.
// ctx.util   -> fmtBytes, debounce, download, copy, toast, readFile, loadScript
// ctx.api()  -> calls a paid/free API through the secure server proxy (keys live in the admin panel)
Zentools.register('tool-name', {
  mount(root, ctx) {
    root.innerHTML = `
      <label class="zt-field">Input
        <textarea id="in" rows="6" placeholder="Type here"></textarea>
      </label>
      <div class="zt-row"><button class="btn btn-primary" id="go">Run</button></div>
      <pre class="zt-out" id="out" aria-live="polite"></pre>`;
    root.querySelector('#go').onclick = () => {
      root.querySelector('#out').textContent = root.querySelector('#in').value;
    };
  }
});
