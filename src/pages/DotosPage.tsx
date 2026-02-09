import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { generateClient } from "aws-amplify/data";

const client = generateClient<Schema>();

function DotosPage() {
  const [dotos, setDotos] = useState<Array<Schema["Doto"]["type"]>>([]);

  useEffect(() => {
    client.models.Doto.observeQuery().subscribe({
      next: (data) => setDotos([...data.items]),
    });
  }, []);

  function createDoto() {
    client.models.Doto.create({ content: window.prompt("Doto content") });
  }

  return (
    <main>
      <h1>My dotos</h1>
      <button onClick={createDoto}>+ new</button>
      <ul>
        {dotos.map((doto) => (
          <li key={doto.id}>{doto.content}</li>
        ))}
      </ul>
      <div>
        🎉 Dotos page working! Try creating a new doto.
      </div>
    </main>
  );
}

export default DotosPage;
