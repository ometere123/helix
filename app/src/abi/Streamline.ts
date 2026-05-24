// Auto-generated from contracts/artifacts/Streamline.sol/Streamline.json. Do not edit.
export const StreamlineAbi = [
  {
    "inputs": [],
    "name": "AlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "IntervalNotElapsed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidParams",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotPayer",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ReentrancyGuardReentrantCall",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      }
    ],
    "name": "SafeERC20FailedOperation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ScheduleCancelled",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ScheduleComplete",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "scheduleId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "remaining",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "executedAt",
        "type": "uint256"
      }
    ],
    "name": "PaymentExecuted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "scheduleId",
        "type": "bytes32"
      }
    ],
    "name": "ScheduleCancelledEvent",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "scheduleId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "payer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "interval",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "totalPayments",
        "type": "uint256"
      }
    ],
    "name": "ScheduleCreated",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "scheduleId",
        "type": "bytes32"
      }
    ],
    "name": "cancelSchedule",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "interval",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalPayments",
        "type": "uint256"
      }
    ],
    "name": "createSchedule",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "scheduleId",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "scheduleId",
        "type": "bytes32"
      }
    ],
    "name": "executePayment",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "scheduleId",
        "type": "bytes32"
      }
    ],
    "name": "getSchedule",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "payer",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "recipient",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "token",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "interval",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "remaining",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastExecutedAt",
            "type": "uint256"
          },
          {
            "internalType": "bool",
            "name": "cancelled",
            "type": "bool"
          }
        ],
        "internalType": "struct Streamline.Schedule",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "scheduleId",
        "type": "bytes32"
      }
    ],
    "name": "nextExecutionAt",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "schedules",
    "outputs": [
      {
        "internalType": "address",
        "name": "payer",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "interval",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "remaining",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastExecutedAt",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "cancelled",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
