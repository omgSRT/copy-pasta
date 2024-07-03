import {
    ChainId,
    EnrollManagerContract,
    chainInfos,
    decodeEnrolledLog,
    getWebSocketProvider,
} from "@blockchain"
import { blockchainConfig, databaseConfig } from "@config"
import { TransactionMongoEntity } from "@database"
import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Timeout } from "@nestjs/schedule"
import { Model } from "mongoose"
import { RedisClientType } from "redis"
import { createClient } from "redis"
import Web3 from "web3"
import { RegisteredSubscription } from "web3-eth"
import { LogsSubscription } from "web3-eth-contract/lib/commonjs/log_subscription"

const PING_INTERVAL = 30 * 1000

@Injectable()
export class BlockchainEvmService implements OnModuleInit {
    private readonly logger = new Logger(BlockchainEvmService.name)

    private web3s: Record<ChainId, Web3<RegisteredSubscription>>
    private enrollManagerContracts: Record<ChainId, EnrollManagerContract>
    private pingIntervals: Record<ChainId, NodeJS.Timeout>
    private subscriptions: Record<ChainId, LogsSubscription>

    constructor(
        @InjectModel(TransactionMongoEntity.name)
        private readonly transactionMongoModel: Model<TransactionMongoEntity>,
    ) {
        const defaultValue = { [ChainId.KalytnTestnet]: undefined }
        this.web3s = { ...defaultValue }
        this.enrollManagerContracts = { ...defaultValue }
        this.pingIntervals = { ...defaultValue }
        this.subscriptions = { ...defaultValue }
    }

    private redisPubClient: RedisClientType
    async onModuleInit() {
        this.redisPubClient = createClient({
            url: `redis://${databaseConfig().redis.host}:${databaseConfig().redis.port}`,
        })
        await this.redisPubClient.connect()
    }

    @Timeout(0)
    async start() {
        const promises: Array<Promise<void>> = []
        for (const chainId of Object.keys(chainInfos)) {
            const promise = async () => {
                const _chainId = Number.parseInt(chainId) as ChainId
                const provider = getWebSocketProvider(_chainId)
                this.web3s[_chainId] = new Web3(provider)

                this.enrollManagerContracts[_chainId] = new EnrollManagerContract(
                    _chainId,
                    chainInfos[_chainId].enrollManagerAddress,
                    provider,
                )

                //await this.subscribeToNewBlockHeaders(_chainId)

                this.startWebsocketPingInterval(_chainId)

                await this.subscribe(_chainId)

                const web3 = this.web3s[_chainId]
                web3.currentProvider.on("error", (error: unknown) => {
                    this.logger.error(`Websocket Error: ${error}`)
                    this.cleanUp(_chainId)
                    this.startWebsocketPingInterval(_chainId)
                })
                web3.currentProvider.on("end", (error: unknown) => {
                    this.logger.error(`Websocket connection ended: ${error}`)
                    this.cleanUp(_chainId)
                    this.startWebsocketPingInterval(_chainId)
                })
            }
            promises.push(promise())
        }
        await Promise.all(promises)
    }

    private async subscribeToNewBlockHeaders(chainId: ChainId) {
        const web3 = this.web3s[chainId]
        const subscription = await web3.eth.subscribe("newHeads", async (error: unknown, result: { number: number }) => {
            if (error) {
                this.logger.error(`Error subscribing to new block headers: ${error}`)
            } else {
                this.logger.log("info", `New block header received: ${result.number}`)
            }
        })

        subscription.on("data", (blockHeader) => {
            this.logger.log("info", `New block header received: ${blockHeader.number}`)
        })

        subscription.on("error", (error) => {
            this.logger.error(`Error subscribing to new block headers: ${error}`)
        })

        this.logger.log("info", "Listening on %s events with subscription id %s", "newHeads", subscription.id)
    }

    private async startWebsocketPingInterval(chainId: ChainId) {
        //const web3 = this.web3s[chainId]
        this.pingIntervals[chainId] = setInterval(async () => {
            // try {
            //     await web3.eth.net.isListening()
            //     this.logger.log("info", "Websocket connection alive (ping successful)")
            // } catch (error) {
            //     this.logger.warn(`Ping failed, connection might be inactive, ${error}`)
            //     await this.resetProviderAndResubscribe(chainId)
            // }
            this.resetProviderAndResubscribe(chainId)
        }, PING_INTERVAL)
    }

    private cleanUp(chainId: ChainId) {
        clearInterval(this.pingIntervals[chainId])
    }

    private async resetProviderAndResubscribe(chainId: ChainId) {
        const web3 = this.web3s[chainId]
        web3.setProvider(getWebSocketProvider(chainId))
        this.logger.log(`RECONNECT: ${chainInfos[chainId].chainName} - ${chainInfos[chainId].websocketRpcUrl}`)
        
        await this.subscribe(chainId)
    }

    private async subscribe(chainId: ChainId) {
        const provider = getWebSocketProvider(chainId)

        const web3 = this.web3s[chainId]
        let contract = this.enrollManagerContracts[chainId]
        contract = new EnrollManagerContract(
            chainId,
            chainInfos[chainId].enrollManagerAddress,
            provider,
        )

        this.subscriptions[chainId]?.removeAllListeners()
        this.subscriptions[chainId] = contract.contract.events.Enrolled()

        const subscription = this.subscriptions[chainId]

        subscription.on("connected", async (connected: string) => {
            this.logger.verbose(connected)
        })
        subscription.on("data", async (log) => {
            try {
                console.log("called")
                const { payAmount, creatorAddr, feeToAddr } = decodeEnrolledLog(log)
                
                this.logger.verbose(`TRANSACTION VERIFIED: ${log.transactionHash}`)
                console.log( payAmount, creatorAddr, feeToAddr )
                // await this.transactionMongoModel.create({
                //     transactionHash: log.transactionHash,
                //     from,
                //     to,
                //     value,
                //     log,
                // })

                // const message: BlockchainEvmServiceMessage = {
                //     transactionHash: log.transactionHash,
                // }

                // await this.redisPubClient.publish(
                //     BlockchainEvmService.name,
                //     JSON.stringify(message),
                // )
            } catch (ex) {
                this.logger.error(ex)
            }
        })
    }
}

export interface BlockchainEvmServiceMessage {
    transactionHash: string;
}
