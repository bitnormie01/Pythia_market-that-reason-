// Generated from contracts/out/PythiaAIProvider.sol/PythiaAIProvider.json
export const PythiaAIProviderAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "admin",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "fulfiller_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "feeReceiver_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "FULFILLER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "callbackGasLimit",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "feeReceiver",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fulfillReasoning",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "choice",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "reasoningDetailsIpfsCid",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getModel",
    "inputs": [
      {
        "name": "modelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "model",
        "type": "tuple",
        "internalType": "struct IFlapAIProvider.Model",
        "components": [
          {
            "name": "name",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "price",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "enabled",
            "type": "bool",
            "internalType": "bool"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRecentRequests",
    "inputs": [
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "views",
        "type": "tuple[]",
        "internalType": "struct IFlapAIProvider.RequestView[]",
        "components": [
          {
            "name": "requestId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "consumer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "modelId",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "numOfChoices",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "timestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "feePaid",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum IFlapAIProvider.RequestStatus"
          },
          {
            "name": "choice",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "reasoningCid",
            "type": "string",
            "internalType": "string"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRequest",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "view_",
        "type": "tuple",
        "internalType": "struct IFlapAIProvider.RequestView",
        "components": [
          {
            "name": "requestId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "consumer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "modelId",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "numOfChoices",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "timestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "feePaid",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum IFlapAIProvider.RequestStatus"
          },
          {
            "name": "choice",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "reasoningCid",
            "type": "string",
            "internalType": "string"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRequestsByConsumer",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "offset",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "limit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "views",
        "type": "tuple[]",
        "internalType": "struct IFlapAIProvider.RequestView[]",
        "components": [
          {
            "name": "requestId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "consumer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "modelId",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "numOfChoices",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "timestamp",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "feePaid",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum IFlapAIProvider.RequestStatus"
          },
          {
            "name": "choice",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "reasoningCid",
            "type": "string",
            "internalType": "string"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTotalRequests",
    "inputs": [],
    "outputs": [
      {
        "name": "total",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getTotalRequestsByConsumer",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "total",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "invokeConsumerCallback",
    "inputs": [
      {
        "name": "consumer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "choice",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "maxPromptLength",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "reason",
    "inputs": [
      {
        "name": "modelId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "prompt",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "numOfChoices",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "recoverUndeliveredFee",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "to",
        "type": "address",
        "internalType": "address payable"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "refundRequest",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "callerConfirmation",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setCallbackGasLimit",
    "inputs": [
      {
        "name": "newCallbackGasLimit",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setFeeReceiver",
    "inputs": [
      {
        "name": "newReceiver",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setMaxPromptLength",
    "inputs": [
      {
        "name": "newMaxPromptLength",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sweep",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "FlapAIProviderCallbackGasLimitUpdated",
    "inputs": [
      {
        "name": "oldCallbackGasLimit",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newCallbackGasLimit",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FlapAIProviderMaxPromptLengthUpdated",
    "inputs": [
      {
        "name": "oldMaxPromptLength",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newMaxPromptLength",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FlapAIProviderModelRegistered",
    "inputs": [
      {
        "name": "modelId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "price",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FlapAIProviderRefundUndelivered",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "consumer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "refundAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "reason",
        "type": "bytes",
        "indexed": false,
        "internalType": "bytes"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FlapAIProviderRequestFulfilled",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "consumer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "choice",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "reasoningDetailsIpfsCid",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FlapAIProviderRequestMade",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "consumer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "modelId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "prompt",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "numOfChoices",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "feePaid",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FlapAIProviderRequestRefunded",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "consumer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "refundAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FlapAIProviderRequestUndelivered",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "consumer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "choice",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "reasoningDetailsIpfsCid",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "reason",
        "type": "bytes",
        "indexed": false,
        "internalType": "bytes"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "FlapAIProviderCallbackGasLimitTooLow",
    "inputs": [
      {
        "name": "provided",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minimum",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "FlapAIProviderChoiceOutOfRange",
    "inputs": [
      {
        "name": "choice",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "numOfChoices",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "FlapAIProviderInsufficientFee",
    "inputs": [
      {
        "name": "sent",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "required",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "FlapAIProviderInvalidNumOfChoices",
    "inputs": [
      {
        "name": "numOfChoices",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "FlapAIProviderModelNotEnabled",
    "inputs": [
      {
        "name": "modelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "FlapAIProviderModelNotRegistered",
    "inputs": [
      {
        "name": "modelId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "FlapAIProviderPromptExceedsMaxLength",
    "inputs": [
      {
        "name": "promptLength",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxPromptLength",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "FlapAIProviderRequestNotPending",
    "inputs": [
      {
        "name": "requestId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  }
] as const;
