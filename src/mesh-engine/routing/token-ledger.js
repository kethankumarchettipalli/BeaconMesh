/**
 * TokenLedger
 *
 * Verifiable, authoritative token ledger enforcing the central research invariant:
 * Replication tokens must NEVER be silently created, duplicated, or lost during
 * message forwarding, transmission failure, acknowledgement loss, or retry.
 */
export class TokenLedger {
    records = new Map();
    /**
     * Registers initial token budget on the origin node for a message.
     */
    registerInitialBudget(messageId, originNodeId, budget) {
        if (budget <= 0 || !Number.isInteger(budget)) {
            throw new Error(`TokenLedger: Initial replication budget must be a positive integer, got ${budget}`);
        }
        if (this.records.has(messageId)) {
            return; // Already registered
        }
        const balances = new Map();
        balances.set(originNodeId, { available: budget, reserved: 0 });
        this.records.set(messageId, {
            messageId,
            initialBudget: budget,
            nodeBalances: balances,
            transactions: new Map(),
            receipts: new Map(),
        });
    }
    hasMessage(messageId) {
        return this.records.has(messageId);
    }
    getInitialBudget(messageId) {
        const record = this.records.get(messageId);
        if (!record) {
            throw new Error(`TokenLedger: Message "${messageId}" is not registered.`);
        }
        return record.initialBudget;
    }
    getAvailableTokens(nodeId, messageId) {
        const record = this.records.get(messageId);
        return record?.nodeBalances.get(nodeId)?.available ?? 0;
    }
    getReservedTokens(nodeId, messageId) {
        const record = this.records.get(messageId);
        return record?.nodeBalances.get(nodeId)?.reserved ?? 0;
    }
    getTotalNodeTokens(nodeId, messageId) {
        const record = this.records.get(messageId);
        const balance = record?.nodeBalances.get(nodeId);
        return (balance?.available ?? 0) + (balance?.reserved ?? 0);
    }
    /**
     * Prepares and reserves tokens for an outgoing transfer transaction.
     * Atomically transfers tokens from sender's available balance to reserved balance.
     */
    reserveTokens(transactionId, senderId, receiverId, messageId, tokenCount, simTimeMs) {
        if (tokenCount <= 0 || !Number.isInteger(tokenCount)) {
            throw new Error(`TokenLedger: Token reservation must be a positive integer, got ${tokenCount}`);
        }
        const record = this.records.get(messageId);
        if (!record) {
            throw new Error(`TokenLedger: Message "${messageId}" not registered.`);
        }
        let senderBalance = record.nodeBalances.get(senderId);
        if (!senderBalance) {
            senderBalance = { available: 0, reserved: 0 };
            record.nodeBalances.set(senderId, senderBalance);
        }
        if (senderBalance.available < tokenCount) {
            throw new Error(`TokenLedger: Insufficient available tokens on node "${senderId}". Has ${senderBalance.available}, requested ${tokenCount}.`);
        }
        // Atomically move from available to reserved
        senderBalance.available -= tokenCount;
        senderBalance.reserved += tokenCount;
        const tx = {
            transactionId,
            messageId,
            senderId,
            receiverId,
            tokenCount,
            status: "PREPARED",
            preparedAtSimTime: simTimeMs,
        };
        record.transactions.set(transactionId, tx);
        return tx;
    }
    /**
     * Called by receiver upon accepting packet.
     * Credits tokens to receiver and records immutable transaction receipt.
     * Idempotent: If receiver already processed this transaction, returns existing receipt without crediting tokens again.
     */
    commitTokens(transactionId, simTimeMs) {
        for (const record of this.records.values()) {
            const tx = record.transactions.get(transactionId);
            if (tx) {
                // Idempotency check: if receipt already exists, return existing receipt
                const existingReceipt = record.receipts.get(transactionId);
                if (existingReceipt) {
                    return existingReceipt;
                }
                // First-time acceptance: credit receiver
                let receiverBalance = record.nodeBalances.get(tx.receiverId);
                if (!receiverBalance) {
                    receiverBalance = { available: 0, reserved: 0 };
                    record.nodeBalances.set(tx.receiverId, receiverBalance);
                }
                receiverBalance.available += tx.tokenCount;
                tx.status = "COMMITTED";
                tx.acceptedAtSimTime = simTimeMs;
                const receipt = {
                    transactionId,
                    messageId: tx.messageId,
                    senderId: tx.senderId,
                    receiverId: tx.receiverId,
                    tokensCredited: tx.tokenCount,
                    acceptedAtSimTime: simTimeMs,
                };
                record.receipts.set(transactionId, receipt);
                return receipt;
            }
        }
        throw new Error(`TokenLedger: Transaction "${transactionId}" not found for commit.`);
    }
    /**
     * Called by sender upon receiving ACK.
     * Finalizes sender's reserved balance and transitions transaction to ACKNOWLEDGED.
     */
    acknowledgeTransaction(transactionId, simTimeMs) {
        for (const record of this.records.values()) {
            const tx = record.transactions.get(transactionId);
            if (tx) {
                if (tx.status === "ACKNOWLEDGED") {
                    return; // Already acknowledged
                }
                const senderBalance = record.nodeBalances.get(tx.senderId);
                if (!senderBalance) {
                    throw new Error(`TokenLedger: Sender "${tx.senderId}" not found for ACK.`);
                }
                // Finalize reserved balance
                senderBalance.reserved -= tx.tokenCount;
                if (senderBalance.reserved < 0) {
                    throw new Error(`TokenLedger: Negative reserved balance detected on "${tx.senderId}".`);
                }
                tx.status = "ACKNOWLEDGED";
                tx.finalizedAtSimTime = simTimeMs;
                return;
            }
        }
        throw new Error(`TokenLedger: Transaction "${transactionId}" not found for ACK.`);
    }
    /**
     * Called when transfer fails before receiver acceptance (Case A).
     * Restores reserved tokens back to sender's available balance and marks transaction ABORTED.
     */
    abortTransaction(transactionId, reason) {
        for (const record of this.records.values()) {
            const tx = record.transactions.get(transactionId);
            if (tx) {
                if (tx.status === "COMMITTED" || tx.status === "ACKNOWLEDGED") {
                    throw new Error(`TokenLedger: Cannot abort transaction "${transactionId}" that was already committed or acknowledged.`);
                }
                if (tx.status === "ABORTED" || tx.status === "REJECTED") {
                    return; // Already aborted
                }
                const senderBalance = record.nodeBalances.get(tx.senderId);
                if (senderBalance) {
                    senderBalance.reserved -= tx.tokenCount;
                    senderBalance.available += tx.tokenCount;
                }
                tx.status = "ABORTED";
                tx.rejectionReason = reason;
                return;
            }
        }
    }
    /**
     * Retrieves existing receipt for a transaction on a receiver node.
     */
    getReceipt(transactionId) {
        for (const record of this.records.values()) {
            const receipt = record.receipts.get(transactionId);
            if (receipt)
                return receipt;
        }
        return undefined;
    }
    getTransaction(transactionId) {
        for (const record of this.records.values()) {
            const tx = record.transactions.get(transactionId);
            if (tx)
                return tx;
        }
        return undefined;
    }
    /**
     * Verifies the Token Conservation Invariant:
     * totalTokens = availableTokensOnNodes + inFlightPreparedTokens = initialBudget L.
     *
     * Accurately distinguishes between:
     * - Available tokens on nodes (including committed receiver tokens)
     * - In-flight reserved tokens in PREPARED state (not yet committed by receiver)
     * Prevents counting the same tokens in multiple categories.
     */
    verifyConservation(messageId, allNodes) {
        const record = this.records.get(messageId);
        if (!record) {
            throw new Error(`TokenLedger: Message "${messageId}" not registered.`);
        }
        const breakdown = {};
        let totalAvailable = 0;
        for (const node of allNodes) {
            const bal = record.nodeBalances.get(node.id) ?? { available: 0, reserved: 0 };
            breakdown[node.id] = { ...bal };
            totalAvailable += bal.available;
        }
        // In-flight tokens are those reserved in transactions that are still in PREPARED state
        // (i.e. reserved by sender, but not yet accepted or committed by receiver).
        // Once committed, tokens reside in receiver's available balance and must not be double counted.
        let inFlightPreparedTokens = 0;
        for (const tx of record.transactions.values()) {
            if (tx.status === "PREPARED") {
                inFlightPreparedTokens += tx.tokenCount;
            }
        }
        const total = totalAvailable + inFlightPreparedTokens;
        return {
            isConserved: total === record.initialBudget,
            initialBudget: record.initialBudget,
            currentTotal: total,
            breakdown,
        };
    }
    /**
     * Runtime invariant assertion. Throws immediately if token conservation is violated.
     */
    assertConservation(messageId, allNodes) {
        const result = this.verifyConservation(messageId, allNodes);
        if (!result.isConserved) {
            throw new Error(`TokenLedger INVARIANT VIOLATION: Total tokens (${result.currentTotal}) != Initial Budget (${result.initialBudget}) for message "${messageId}". Breakdown: ${JSON.stringify(result.breakdown)}`);
        }
    }
    /**
     * Resets ledger records.
     */
    clear() {
        this.records.clear();
    }
}
