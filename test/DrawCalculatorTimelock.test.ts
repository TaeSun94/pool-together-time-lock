import { expect } from 'chai';
import { deployMockContract, MockContract } from 'ethereum-waffle';
import { Contract, ContractFactory } from 'ethers';
import { ethers, artifacts } from 'hardhat';

import { increaseTime as increaseTimeHelper } from './helpers/increaseTime';

const { getSigners, provider } = ethers;
const { getBlock } = provider;

const increaseTime = (time: number) => increaseTimeHelper(provider, time);

describe('DrawCalculatorTimelock', () => {
    let wallet1: any;
    let wallet2: any;

    let drawCalculatorTimelock: Contract;

    let drawCalculator: MockContract;

    let drawCalculatorTimelockFactory: ContractFactory;

    beforeEach(async () => {
        [wallet1, wallet2] = await getSigners();

        const IDrawCalculator = await artifacts.readArtifact('IDrawCalculator');
        drawCalculator = await deployMockContract(wallet1, IDrawCalculator.abi);

        drawCalculatorTimelockFactory = await ethers.getContractFactory('DrawCalculatorTimelock');

        drawCalculatorTimelock = await drawCalculatorTimelockFactory.deploy(
            wallet1.address,
            drawCalculator.address,
        );
    });

    describe('constructor()', () => {
        it('should emit Deployed event', async () => {
            await expect(drawCalculatorTimelock.deployTransaction)
                .to.emit(drawCalculatorTimelock, 'Deployed')
                .withArgs(drawCalculator.address);
        });

        it('should set the draw calculator', async () => {
            expect(await drawCalculatorTimelock.getDrawCalculator()).to.equal(
                drawCalculator.address,
            );
        });
    });

    describe('setTimelock()', () => {
        it('should allow the owner to force the timelock', async () => {
            const timestamp = 523;
            await drawCalculatorTimelock.setTimelock({
                drawId: 1,
                timestamp,
            });

            const timelock = await drawCalculatorTimelock.getTimelock();
            expect(timelock.drawId).to.equal(1);
            expect(timelock.timestamp).to.equal(timestamp);
        });
    });

    describe('lock()', () => {
        let timelock: { drawId: number; timestamp: number };

        beforeEach(async () => {
            timelock = {
                drawId: 1,
                timestamp: (await getBlock('latest')).timestamp,
            };

            await drawCalculatorTimelock.setTimelock(timelock);
        });

        it('should lock next draw id and set the unlock timestamp', async () => {
            await increaseTime(61);

            // Locks Draw ID 2 and set the unlock timestamp to occur in 100 seconds.
            await expect(
                drawCalculatorTimelock.lock(2, (await getBlock('latest')).timestamp + 100),
            ).to.emit(drawCalculatorTimelock, 'LockedDraw');
            console.log("LOCK: ", (await getBlock('latest')).timestamp + 100)
            const timelock = await drawCalculatorTimelock.getTimelock();
            const currentTimestamp = (await getBlock('latest')).timestamp;

            expect(timelock.drawId).to.equal(2);
            expect(timelock.timestamp).to.equal(currentTimestamp + 99);
        });

        it('should lock next draw id if manager', async () => {
            await drawCalculatorTimelock.setManager(wallet2.address);

            await increaseTime(61);
            await drawCalculatorTimelock
                .connect(wallet2)
                .lock(2, (await getBlock('latest')).timestamp + 1);

            const timelock = await drawCalculatorTimelock.getTimelock();
            const currentTimestamp = (await getBlock('latest')).timestamp;

            expect(timelock.drawId).to.equal(2);
            expect(timelock.timestamp).to.equal(currentTimestamp);
        });

        it('should fail if not called by the owner or manager', async () => {
            await expect(
                drawCalculatorTimelock
                    .connect(wallet2)
                    .lock(1, (await getBlock('latest')).timestamp),
            ).to.be.revertedWith('Manageable/caller-not-manager-or-owner');
        });

        it('should fail to lock if trying to lock current or previous draw id', async () => {
            await expect(
                drawCalculatorTimelock.lock(1, (await getBlock('latest')).timestamp),
            ).to.be.revertedWith('OM/not-drawid-plus-one');
        });
    });

    describe('hasElapsed()', () => {
        it('should return true if the timelock has not been set', async () => {
            expect(await drawCalculatorTimelock.hasElapsed()).to.equal(true);
        });

        it('should return true if the timelock has expired', async () => {
            await drawCalculatorTimelock.setTimelock({
                drawId: 1,
                timestamp: (await getBlock('latest')).timestamp,
            });

            await increaseTime(61);
            expect(await drawCalculatorTimelock.hasElapsed()).to.equal(true);
        });

        it('should return false if the timelock has not expired', async () => {
            await drawCalculatorTimelock.setTimelock({
                drawId: 1,
                timestamp: (await getBlock('latest')).timestamp + 100,
            });

            expect(await drawCalculatorTimelock.hasElapsed()).to.equal(false);
        });
    });

    describe('calculate()', () => {
        it('should do nothing if no timelock is set', async () => {
            await drawCalculator.mock.calculate
                .withArgs(wallet1.address, [0], '0x')
                .returns([43], '0x');
            const result = await drawCalculatorTimelock.calculate(wallet1.address, [0], '0x');
            expect(result[0][0]).to.equal('43');
        });

        context('with timelock set', () => {
            let timestamp: number;

            beforeEach(async () => {
                timestamp = (await getBlock('latest')).timestamp;

                await drawCalculatorTimelock.setTimelock({
                    drawId: 1,
                    timestamp: timestamp + 1000,
                });
            });

            it('should revert if the timelock is set for the draw', async () => {
                await expect(
                    drawCalculatorTimelock.calculate(wallet1.address, [1], '0x'),
                ).to.be.revertedWith('OM/timelock-not-expired');
            });

            it('should pass for draws that are not locked', async () => {
                await drawCalculator.mock.calculate
                    .withArgs(wallet1.address, [0, 2], '0x')
                    .returns([44, 5], '0x');

                const result = await drawCalculatorTimelock.calculate(
                    wallet1.address,
                    [0, 2],
                    '0x',
                );

                expect(result[0][0]).to.equal('44');
                expect(result[0][1]).to.equal('5');
            });
        });
    });
});
