/**
 * > .\node_modules\.bin\testrpc (Windows)
 */

const Web3 = require('web3');
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
const fs = require('fs');
const solc = require('solc');

const contractToCompile = 'Voting'; // .sol (in local directory)
const listOfCandidates = ['Nick', 'Edward', 'John'];
const contractDetailsOutputFile = `${__dirname}/client/votingContractData.js`;

let contractAccount; // will be assigned later

// Let's see the list of available accounts first.
console.log(`Список доступных аккаунтов...`);
web3.eth.getAccounts().then(accountsList => {
  console.log(`Доступные аккаунты (${accountsList.length}):\r\n${accountsList.join('\r\n')}`);
  contractAccount = accountsList[0];
  console.log(`Контракт будет запущен пользователем: ${contractAccount}`);

  compile(contractToCompile);
});

function compile(contractName) {
  console.log(`Compiling ${contractName}.sol...`);

  const contractCode = fs.readFileSync(`${contractName}.sol`).toString();
  const compiledCode = solc.compile(contractCode);
  const abiDefinition = JSON.parse(compiledCode.contracts[`:${contractName}`].interface);
  const contract = new web3.eth.Contract(abiDefinition);
  // abiDefinition and contract address are the only things we need to interact with the contract,
  // and we will save them to a file later.

  deploy(contractName, contract, compiledCode, abiDefinition);
}

function deploy(contractName, contract, compiledCode, abiDefinition) {
  console.log(`Поготовка контракта ${contractName}`);

  const preparedContract = contract.deploy(
    {
      data: compiledCode.contracts[`:${contractName}`].bytecode,
      gas: 4700000,
      arguments: [
        // first argument: array of names (which we need to convert to HEX)
        listOfCandidates.map(name => web3.utils.asciiToHex(name)),
      ],
    },
    err => err && console.error(err)
  );

  preparedContract.estimateGas().then(gas => {
    console.log(`Кол-во газа(комиссия) для развертывания этого контракта: ${gas}`);

    preparedContract
      .send({
        from: contractAccount,
        gas: gas + 100000,
      })
      .then(deployedContract => {
        console.log(
          `Контракт успешно развернут, адрес контракта: ${deployedContract.options.address}`
        );

        fs.writeFile(
          // save contract info to a file to access contract data from the client
          contractDetailsOutputFile,
          `window.contractAddress="${deployedContract.options.address}";\n` +
            `window.contractABI=${JSON.stringify(abiDefinition)};\n` +
            `window.candidates=${JSON.stringify(listOfCandidates)};\n` +
            `window.testAccount="${contractAccount}";`,
          () => interactionTest(deployedContract)
        );
      });
  });
}

function interactionTest(contract) {
  // Check -> Vote -> Check -> Vote -> Check! (Should be 2 votes)
  checkVotes(() =>
    voteFor(listOfCandidates[0], () =>
      checkVotes(() =>
        voteFor(listOfCandidates[0], () =>
          checkVotes(() => console.log('Успешно! Обратитесь к клиентской части.'))
        )
      )
    )
  );

  function checkVotes(next) {
    console.log(`Голосов за кандидата ${listOfCandidates[0]}...`);

    contract.methods['totalVotesFor'](web3.utils.asciiToHex(listOfCandidates[0]))
      .call()
      .then(votes => {
        console.log(
          `${listOfCandidates[0]} было получено ${votes} голосов${votes === 1 ? '' : 's'}!`
        );

        next();
      });
  }

  function voteFor(candidate, next) {
    console.log(`Голос за ${candidate} от ${contractAccount}...`);

    contract.methods['voteForCandidate'](
      web3.utils.asciiToHex(candidate) // again, convert candidate name to HEX
    )
      .send({
        from: contractAccount, // let the contract holder vote
      })
      .then(tx => {
        console.log(
          `Успешное голосование за ${candidate}. Газа использовано: ${tx.gasUsed} Хэш тразакции: ${
            tx.transactionHash
          }`
        );

        next();
      });
  }
}
