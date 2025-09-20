// Generated types from IDL
export type SolanaPerpsFlywheelProgram = {
  "address": "HSMR7nCvy29baTVaZRUafxZXU9UhfeFrmFtRSJW3r1gj"
  "metadata": {
    "name": "solana_perps_flywheel"
    "version": "0.1.0"
    "spec": "0.1.0"
  }
  "instructions": [
    {
      "name": "closePosition"
      "discriminator": [123, 134, 81, 0, 49, 68, 98, 98]
      "accounts": [
        {
          "name": "user"
          "writable": true
          "signer": true
        },
        {
          "name": "config"
          "writable": true
        },
        {
          "name": "market"
          "writable": true
        },
        {
          "name": "oracle"
        },
        {
          "name": "userPosition"
          "writable": true
          "pda": {
            "seeds": [
              {
                "kind": "const"
                "value": [112, 111, 115]
              },
              {
                "kind": "account"
                "path": "user"
              },
              {
                "kind": "account"
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "userToken"
          "writable": true
        },
        {
          "name": "vaultToken"
          "writable": true
        },
        {
          "name": "feeDestination"
          "writable": true
        },
        {
          "name": "tokenProgram"
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ]
      "args": []
    },
    {
      "name": "openPosition"
      "discriminator": [135, 128, 47, 77, 15, 152, 240, 49]
      "accounts": [
        {
          "name": "user"
          "writable": true
          "signer": true
        },
        {
          "name": "config"
          "writable": true
        },
        {
          "name": "market"
          "writable": true
        },
        {
          "name": "oracle"
        },
        {
          "name": "userPosition"
          "writable": true
          "pda": {
            "seeds": [
              {
                "kind": "const"
                "value": [112, 111, 115]
              },
              {
                "kind": "account"
                "path": "user"
              },
              {
                "kind": "account"
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "userToken"
          "writable": true
        },
        {
          "name": "vaultToken"
          "writable": true
        },
        {
          "name": "tokenProgram"
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram"
          "address": "11111111111111111111111111111111"
        }
      ]
      "args": [
        {
          "name": "isLong"
          "type": "bool"
        },
        {
          "name": "quoteToSpend"
          "type": "u64"
        },
        {
          "name": "leverageX"
          "type": "u16"
        }
      ]
    }
  ]
  "accounts": [
    {
      "name": "Config"
      "discriminator": [155, 12, 170, 224, 30, 250, 204, 130]
    },
    {
      "name": "Market"
      "discriminator": [219, 190, 213, 55, 0, 227, 198, 154]
    },
    {
      "name": "UserPosition"
      "discriminator": [251, 248, 209, 245, 83, 234, 17, 27]
    }
  ]
  "types": [
    {
      "name": "Config"
      "type": {
        "kind": "struct"
        "fields": [
          {
            "name": "admin"
            "type": "publicKey"
          },
          {
            "name": "quoteMint"
            "type": "publicKey"
          },
          {
            "name": "feeBps"
            "type": "u16"
          },
          {
            "name": "liqFeeBps"
            "type": "u16"
          },
          {
            "name": "feeDestination"
            "type": "publicKey"
          },
          {
            "name": "insuranceVault"
            "type": "publicKey"
          },
          {
            "name": "creatorRewardMint"
            "type": "publicKey"
          },
          {
            "name": "creatorRewardBps"
            "type": "u16"
          },
          {
            "name": "paused"
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "Market"
      "type": {
        "kind": "struct"
        "fields": [
          {
            "name": "symbol"
            "type": {
              "array": ["u8", 12]
            }
          },
          {
            "name": "baseDecimals"
            "type": "u8"
          },
          {
            "name": "oracle"
            "type": "publicKey"
          },
          {
            "name": "ammBaseReserveFp"
            "type": "u128"
          },
          {
            "name": "ammQuoteReserveFp"
            "type": "u128"
          },
          {
            "name": "fundingRateFp"
            "type": "i128"
          },
          {
            "name": "lastFundingTs"
            "type": "i64"
          },
          {
            "name": "skewKBps"
            "type": "u32"
          },
          {
            "name": "maxPositionBase"
            "type": "u64"
          },
          {
            "name": "maintenanceMarginBps"
            "type": "u16"
          },
          {
            "name": "takerLeverageCapX"
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "UserPosition"
      "type": {
        "kind": "struct"
        "fields": [
          {
            "name": "owner"
            "type": "publicKey"
          },
          {
            "name": "market"
            "type": "publicKey"
          },
          {
            "name": "isLong"
            "type": "bool"
          },
          {
            "name": "baseSize"
            "type": "i64"
          },
          {
            "name": "entryPriceFp"
            "type": "u128"
          },
          {
            "name": "marginDeposited"
            "type": "u64"
          },
          {
            "name": "lastFundingSettled"
            "type": "i64"
          }
        ]
      }
    }
  ]
}

// Types for our UI
export interface Market {
  address: string;
  symbol: string;
  baseDecimals: number;
  oracle: string;
  ammBaseReserveFp: bigint;
  ammQuoteReserveFp: bigint;
  fundingRateFp: bigint;
  lastFundingTs: bigint;
  skewKBps: number;
  maxPositionBase: bigint;
  maintenanceMarginBps: number;
  takerLeverageCapX: number;
}

export interface UserPosition {
  owner: string;
  market: string;
  isLong: boolean;
  baseSize: bigint;
  entryPriceFp: bigint;
  marginDeposited: bigint;
  lastFundingSettled: bigint;
}

export interface Config {
  admin: string;
  quoteMint: string;
  feeBps: number;
  liqFeeBps: number;
  feeDestination: string;
  insuranceVault: string;
  creatorRewardMint: string;
  creatorRewardBps: number;
  paused: boolean;
}
