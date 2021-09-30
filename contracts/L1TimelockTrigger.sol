// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.6;

import "@pooltogether/owner-manager-contracts/contracts/Manageable.sol";

import "@pooltogether/v4-core/contracts/interfaces/IPrizeDistributionHistory.sol";

import "./interfaces/IDrawCalculatorTimelock.sol";

/**
  * @title  PoolTogether V4 L1TimelockTrigger
  * @author PoolTogether Inc Team
  * @notice L1TimelockTrigger(s) acts as an intermediary between multiple V4 smart contracts.
            The L1TimelockTrigger is responsible for pushing Draws to a DrawHistory and routing
            claim requests from a ClaimableDraw to a DrawCalculator. The primary objective is
            to  include a "cooldown" period for all new Draws. Allowing the correction of a
            malicously set Draw in the unfortunate event an Owner is compromised.
*/
contract L1TimelockTrigger is Manageable {
    /* ============ Events ============ */

    /// @notice Emitted when the contract is deployed.
    /// @param prizeDistributionHistory The address of the prize distribution history contract.
    /// @param timelock The address of the DrawCalculatorTimelock
    event Deployed(
        IPrizeDistributionHistory indexed prizeDistributionHistory,
        IDrawCalculatorTimelock indexed timelock
    );

    /* ============ Global Variables ============ */

    /// @notice Internal PrizeDistributionHistory reference.
    IPrizeDistributionHistory public immutable prizeDistributionHistory;

    /// @notice Timelock struct reference.
    IDrawCalculatorTimelock public timelock;

    /* ============ Deploy ============ */

    /**
     * @notice Initialize L1TimelockTrigger smart contract.
     * @param _owner                       Address of the L1TimelockTrigger owner.
     * @param _prizeDistributionHistory PrizeDistributionHistory address
     * @param _timelock           Elapsed seconds before new Draw is available
     */
    constructor(
        address _owner,
        IPrizeDistributionHistory _prizeDistributionHistory,
        IDrawCalculatorTimelock _timelock
    ) Ownable(_owner) {
        prizeDistributionHistory = _prizeDistributionHistory;
        timelock = _timelock;

        emit Deployed(_prizeDistributionHistory, _timelock);
    }

    /**
     * @notice Push Draw onto draws ring buffer history.
     * @dev    Restricts new draws by forcing a push timelock.
     * @param _drawId draw id
     * @param _drawSetting Draw settings
     */
    function push(uint32 _drawId, DrawLib.PrizeDistribution memory _drawSetting)
        external
        onlyManagerOrOwner
    {
        timelock.lock(_drawId);
        prizeDistributionHistory.pushPrizeDistribution(_drawId, _drawSetting);
    }
}
