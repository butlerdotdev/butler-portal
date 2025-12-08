import { makeStyles } from '@material-ui/core';

const useStyles = makeStyles({
	icon: {
		width: 24,
		height: 24,
		borderRadius: 4,
		objectFit: 'contain',
	},
});

const ButlerIcon = () => {
	const classes = useStyles();
	return <img src="/butler-icon.svg" alt="" className={classes.icon} />;
};

export default ButlerIcon;
