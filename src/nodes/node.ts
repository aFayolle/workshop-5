import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import { delay } from "../utils";

export async function node(
  nodeId: number, // the ID of the node
  N: number, // total number of nodes in the network
  F: number, // number of faulty nodes in the network
  initialValue: Value, // initial value of the node
  isFaulty: boolean, // true if the node is faulty, false otherwise
  nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
  setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let mynode: NodeState = {
    killed: false,
    x: null,
    decided: null,
    k: null,
  }
  //
  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  node.get("/status", (req, res) => {
    if (isFaulty) {
      
      mynode.x = null;
      mynode.decided = null;
      mynode.k = null;
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });


  // TODO implement this
  // this route allows the node to receive messages from other nodes
  // node.post("/message", (req, res) => {});
  node.post("/message", async function(req, res) {
    // Récupération des données du message
    let { k, x, messageType } = req.body;
  
    // Vérification si le nœud est défectueux ou arrêté
    if (!isFaulty && !mynode.killed) {
      // Si le message est de type "propose"
      if (messageType == "propose") {
        // Initialisation de la structure de données pour stocker les propositions
        if (!proposals.has(k)) {
          proposals.set(k, []);
        }
        proposals.get(k)!.push(x); // Stockage de la proposition
        let proposal = proposals.get(k);
        proposal=proposal!;
        // Si le nombre de propositions reçues dépasse le seuil de tolérance
        if (proposal.length >= (N - F)) {
          // Compter le nombre de votes pour chaque valeur
          let count0 = proposal.filter(function(el) { return el == 0; }).length;
          let count1 = proposal.filter(function(el) { return el == 1; }).length;
  
          // Détermination de la valeur de consensus
          if (count0 > (N / 2)) {
            x = 0;
          } else if (count1 > (N / 2)) {
            x = 1;
          } else {
            x = "?";
          }
  
          // Envoyer un message de vote à tous les autres nœuds
          for (let i = 0; i < N; i++) {
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ k: k, x: x, messageType: "vote" }),
            });
          }
        }
      }
      // Si le message est de type "vote"
      else if (messageType == "vote") {
        // Initialisation de la structure de données pour stocker les votes
        if (!votes.has(k)) {
          votes.set(k, []);
        }
        votes.get(k)!.push(x); // Stockage du vote
        let vote = votes.get(k)!;
  
        // Si le nombre de votes reçus dépasse le seuil de tolérance
        if (vote.length >= (N - F)) {
          console.log("vote", vote, "node :", nodeId, "k :", k);
          // Compter le nombre de votes pour chaque valeur
          let count0 = vote.filter(function(el) { return el == 0; }).length;
          let count1 = vote.filter(function(el) { return el == 1; }).length;
  
          // Détermination de la valeur de consensus
          if (count0 >= F + 1) {
            mynode.x = 0;
            mynode.decided = true;
          } else if (count1 >= F + 1) {
            mynode.x = 1;
            mynode.decided = true;
          } else {
            // Si aucun consensus n'est atteint, le nœud choisit aléatoirement une valeur
            if (count0 + count1 > 0 && count0 > count1) {
              mynode.x = 0;
            } else if (count0 + count1 > 0 && count0 < count1) {
              mynode.x = 1;
            } else {
              mynode.x = Math.random() > 0.5 ? 0 : 1;
            }
            mynode.k = k + 1;
  
            // Envoyer un message de proposition aux autres nœuds
            for (let i = 0; i < N; i++) {
              fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ k: mynode.k, x: mynode.x, messageType: "propose" }),
              });
            }
          }
        }
      }
    }
    // Répondre au client
    res.status(200).send("Message received and processed.");
  });
  
  

  // TODO implement this
  // this route is used to start the consensus algorithm
  // node.get("/start", async (req, res) => {});
  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) {
      await delay(5);
    }
    if (!isFaulty) {
      mynode.k = 1;
      mynode.x = initialValue;
      mynode.decided = false;
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ k: mynode.k, x: mynode.x, messageType: "propose" }),
        });
      }
    }
    else {
      mynode.decided = null;
      mynode.x = null;
      mynode.k = null;
    }
    res.status(200).send("Consensus algorithm started.");
  });


  node.get("/stop", (req, res) => {
    mynode.killed = true;
    res.status(200).send("killed");
  });

  
  node.get("/getState", (req, res) => {
    res.status(200).send({
      killed: mynode.killed,
      x: mynode.x,
      decided: mynode.decided,
      k: mynode.k,
    });
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
