# NACOS UNN Blockchain Voting System

A prototype election platform developed for the University of Nigeria, Nsukka (UNN) chapter of the Nigerian Association of Computing Students (NACOS).

## Project Overview

This project explores how blockchain technology can support the integrity and verifiability of electronic voting. It includes a demonstration administration interface for managing voters and candidates.

**Status:** Prototype under development. The current NACOS administration interface stores demo data in browser local storage. It is not yet a production-ready election system.

## Current Features

- Demonstration dashboard for election administration.
- Register and search demo voters.
- Register and search candidates by office.
- Activate or deactivate demo voters and candidates.
- Persist demonstration data in browser local storage.
- Initial blockchain integration code for recording ballots.

## Demonstration Data

The initial candidates and voters are fictional demonstration records. They do not represent actual NACOS UNN candidates or registered students.

## Technology Stack

- React
- Vite
- JavaScript
- Node.js and Express
- Supabase integration code
- Ethers.js for Ethereum-compatible blockchain interaction

## Running Locally

Install dependencies:

```bash
npm install
```

Start the frontend development server:

```bash
npm run dev
```

The administration demo is available at:

`http://localhost:5173/unn-demo-admin`

To start the backend, use `npm run server` after configuring the required environment variables and verifying the backend configuration.

## Security and Limitations

- The current demonstration administration page does not have authentication.
- Browser local storage is not a secure database for election records.
- Blockchain functionality requires a configured RPC endpoint, a separately deployed election contract, and the appropriate environment variables.
- Supabase stores only a keyed voter pseudonym, not a registration number, with each ballot. The pseudonym is derived from the server-only `BALLOT_ENCRYPTION_KEY`; keep that key stable across deployments. This prevents a database-only reader without the key from directly joining ballots to voters, but does not protect against a backend operator or timing correlation.
- Backend authentication, voter eligibility checks, database permissions, ballot validation, and end-to-end blockchain verification must be implemented and tested before any real election.
- Never commit private keys, service-role keys, passwords, or `.env` files to GitHub.

## Project Purpose

This prototype demonstrates a potential approach to electronic voting in which blockchain records can help make submitted ballots verifiable and reduce the possibility of undetected result manipulation.

It is an academic demonstration and must not be used for a real election in its current state.