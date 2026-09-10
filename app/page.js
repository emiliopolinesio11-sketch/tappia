export default function Home() {
  return <main>
    <nav><a className="brand" href="/">tappia<span>●</span></a><span className="badge">MVP · Prueba inicial</span></nav>
    <section><p className="eyebrow">QR + NFC / ENLACES DINÁMICOS</p><h1>Tu placa permanece.<br/><span>El destino cambia.</span></h1><p className="intro">Una dirección para cada placa. Cambia a dónde lleva sin volver a imprimir tu QR ni programar tu NFC.</p></section>
    <article><div className="cardhead"><span className="eyebrow">PLACA DE PRUEBA</span><span className="active">● Activa</span></div><h2>A001</h2><p className="route">/r/A001</p><div className="destination"><span>Destino de demostración</span><strong>example.com</strong></div><a className="button" href="/r/A001" target="_blank" rel="noreferrer">Probar redirección <span>↗</span></a><p className="note">Abre el destino de ejemplo en otra pestaña.</p></article>
    <aside><h3>Así funciona esta primera versión</h3><p>El QR y el NFC guardan la dirección de la placa. Su destino se configura en el proyecto y se actualiza al publicar los cambios.</p><p>La edición desde un panel llegará al conectar la base de datos.</p></aside>
    <footer>Tappia <span>Una conexión. Nuevas posibilidades.</span></footer>
  </main>;
}
